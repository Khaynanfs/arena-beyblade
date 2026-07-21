# -*- coding: utf-8 -*-
"""
Arena Beyblade — servidor do jogo (aiohttp + WebSockets)
Roda a simulação física autoritativa e gerencia salas 1x1 com espectadores.
"""
import asyncio
import json
import math
import os
import random
import string
from pathlib import Path

from aiohttp import web, WSMsgType

# Hospedagens (Render, Railway, HF Spaces…) definem a porta via variável PORT
PORT = int(os.environ.get("PORT", 3000))
PUBLIC = Path(__file__).parent / "public"

# ---------------- Constantes da simulação ----------------
DT = 1 / 30
ARENA_R = 9.0          # raio útil da arena
TOP_R = 0.95           # raio de cada beyblade
RINGOUT_V = 10.0       # velocidade radial base para ring-out
# Bolsões de ring-out (como no estádio Burst real): sair é mais fácil por eles
POCKETS = (math.pi / 2, math.pi / 2 + 2 * math.pi / 3, math.pi / 2 - 2 * math.pi / 3)
POCKET_HALF = 0.30     # meia-largura angular de cada bolsão (rad)
MAX_VEL = 18.0
MAX_SPIN = 1000.0
ROUND_TIME = 90.0      # limite de tempo da rodada (s)
WIN_SCORE = 3          # primeiro a 3 pontos vence (regra Burst)
SKILL_CD = 6.0         # cooldown da habilidade (s)

# ---------------- Peças ----------------
# Cada peça tem: atk, def, sta (estamina), wgt (peso), spd (velocidade), br (resistência a burst)
LAYERS = {
    "dragao": {
        "nome": "Dragão Voraz", "tipo": "Ataque", "cor": 0xE0452B,
        "atk": 9, "def": 3, "sta": 4, "wgt": 5, "spd": 6, "br": 5,
        "skill": {"id": "dash", "nome": "Investida Flamejante",
                  "desc": "Avança contra o oponente em altíssima velocidade por 1,2s."},
    },
    "fortaleza": {
        "nome": "Fortaleza Titânica", "tipo": "Defesa", "cor": 0x3F6FD1,
        "atk": 3, "def": 9, "sta": 5, "wgt": 8, "spd": 2, "br": 8,
        "skill": {"id": "shield", "nome": "Muralha de Ferro",
                  "desc": "Por 2,5s reduz muito o dano e o empurrão recebidos, refletindo parte do impacto."},
    },
    "fenix": {
        "nome": "Fênix Solar", "tipo": "Resistência", "cor": 0xF2A93B,
        "atk": 2, "def": 4, "sta": 10, "wgt": 4, "spd": 4, "br": 6,
        "skill": {"id": "recover", "nome": "Renascer da Fênix",
                  "desc": "Recupera instantaneamente 12% da rotação máxima."},
    },
    "quimera": {
        "nome": "Quimera Mística", "tipo": "Equilíbrio", "cor": 0x8E5FD6,
        "atk": 6, "def": 6, "sta": 6, "wgt": 6, "spd": 5, "br": 6,
        "skill": {"id": "drain", "nome": "Presas da Quimera",
                  "desc": "Por 3s, cada colisão rouba rotação do oponente para você."},
    },
    "leviata": {
        "nome": "Leviatã Abissal", "tipo": "Ataque Pesado", "cor": 0x2FB47C,
        "atk": 10, "def": 2, "sta": 3, "wgt": 7, "spd": 5, "br": 3,
        "skill": {"id": "quake", "nome": "Maré Esmagadora",
                  "desc": "O próximo impacto em até 4s causa dano e empurrão massivos."},
    },
}

DISKS = {
    "tita":   {"nome": "Titã",   "tipo": "Peso",       "atk": 1, "def": 3, "sta": 1, "wgt": 8, "spd": 0, "br": 3},
    "lamina": {"nome": "Lâmina", "tipo": "Ofensivo",   "atk": 5, "def": 0, "sta": 1, "wgt": 4, "spd": 2, "br": 1},
    "orbe":   {"nome": "Orbe",   "tipo": "Estabilidade","atk": 0, "def": 2, "sta": 5, "wgt": 5, "spd": 0, "br": 2},
    "vetor":  {"nome": "Vetor",  "tipo": "Mobilidade", "atk": 2, "def": 1, "sta": 2, "wgt": 2, "spd": 5, "br": 1},
}

DRIVERS = {
    "agulha":   {"nome": "Agulha",   "tipo": "Resistência", "atk": 0, "def": 1, "sta": 6, "wgt": 1, "spd": 1, "br": 2,
                 "orbit": 0.15, "centering": 1.35, "extra_decay": 0.0,
                 "desc": "Gira estável no centro da arena, gastando pouca rotação."},
    "borracha": {"nome": "Borracha", "tipo": "Ataque",      "atk": 5, "def": 1, "sta": 0, "wgt": 2, "spd": 5, "br": 4,
                 "orbit": 1.0, "centering": 0.55, "extra_decay": 3.0,
                 "desc": "Corre agressivamente pela borda, mas consome rotação rápido."},
    "esfera":   {"nome": "Esfera",   "tipo": "Defesa",      "atk": 0, "def": 5, "sta": 3, "wgt": 3, "spd": 1, "br": 5,
                 "orbit": 0.3, "centering": 1.1, "extra_decay": 0.5,
                 "desc": "Base arredondada que absorve impactos sem perder o eixo."},
    "plano":    {"nome": "Plano",    "tipo": "Velocidade",  "atk": 3, "def": 1, "sta": 1, "wgt": 1, "spd": 6, "br": 2,
                 "orbit": 1.2, "centering": 0.7, "extra_decay": 1.5,
                 "desc": "Movimento amplo e imprevisível em círculos largos."},
}

STAT_KEYS = ("atk", "def", "sta", "wgt", "spd", "br")


def compute_stats(sel):
    """Combina as 3 peças em stats derivados usados pela física."""
    layer = LAYERS[sel["layer"]]
    disk = DISKS[sel["disk"]]
    driver = DRIVERS[sel["driver"]]
    s = {k: layer[k] + disk[k] + driver[k] for k in STAT_KEYS}
    return {
        "sums": s,
        "mass": 1.0 + s["wgt"] * 0.06,
        "move_force": 6.0 + s["spd"] * 0.65,
        "decay": max(5.0, 17.0 - s["sta"] * 0.55) + driver["extra_decay"],
        "dmg_mul": 1.0 + s["atk"] * 0.09,
        "dmg_taken": 1.0 / (1.0 + s["def"] * 0.06),
        "burst_taken": 1.0 / (1.0 + s["br"] * 0.07),
        "orbit": driver["orbit"],
        "centering": driver["centering"],
        "skill": layer["skill"],
    }


def valid_sel(sel):
    return (isinstance(sel, dict) and sel.get("layer") in LAYERS
            and sel.get("disk") in DISKS and sel.get("driver") in DRIVERS)


# Estilos de lançamento (como no jogo real: você escolhe o saque e torce)
ESTILOS = ("potente", "rasante", "central")

BOT_NOMES = ("Bot Ciclone", "Bot Tempestade", "Bot Vendaval", "Bot Furacão")


def random_sel():
    return {"layer": random.choice(list(LAYERS)),
            "disk": random.choice(list(DISKS)),
            "driver": random.choice(list(DRIVERS))}


# ---------------- Salas ----------------
rooms = {}


def new_code():
    alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        c = "".join(random.choice(alpha) for _ in range(4))
        if c not in rooms:
            return c


class Player:
    def __init__(self, ws, nome, is_bot=False):
        self.ws = ws
        self.nome = nome[:20] or "Blader"
        self.is_bot = is_bot
        self.sel = None
        self.pronto = False
        self.launch = None
        self.score = 0
        self.revanche = False


class Room:
    def __init__(self, codigo):
        self.codigo = codigo
        self.players = []       # até 2
        self.espectadores = []  # websockets
        self.fase = "escolha"
        self.rodada = 0
        self.time = 0.0
        self.tops = None
        self.task = None
        self.last_hit = -1.0

    # ---- comunicação ----
    async def broadcast(self, msg):
        data = json.dumps(msg)
        targets = [p.ws for p in self.players if p.ws] + list(self.espectadores)
        for ws in targets:
            try:
                await ws.send_str(data)
            except Exception:
                pass

    def jogadores_info(self):
        return [{"idx": i, "nome": p.nome, "pronto": p.pronto, "sel": p.sel}
                for i, p in enumerate(self.players)]

    def placar(self):
        return [p.score for p in self.players] + [0] * (2 - len(self.players))

    async def send_lobby(self):
        await self.broadcast({"t": "jogadores", "lista": self.jogadores_info(),
                              "espectadores": len(self.espectadores)})

    # ---- fluxo de partida ----
    async def try_start(self):
        if (self.fase == "escolha" and len(self.players) == 2
                and all(p.pronto for p in self.players)):
            await self.start_launch()

    async def start_launch(self):
        self.fase = "lancamento"
        self.rodada += 1
        for p in self.players:
            p.launch = None
            if p.is_bot:
                p.launch = {"power": random.uniform(0.55, 0.95),
                            "estilo": random.choice(ESTILOS)}
        await self.broadcast({"t": "faseLancamento", "rodada": self.rodada,
                              "placar": self.placar(),
                              "jogadores": self.jogadores_info()})
        self.task = asyncio.create_task(self._launch_timeout())

    async def _launch_timeout(self):
        await asyncio.sleep(7)
        if self.fase == "lancamento":
            for p in self.players:
                if p.launch is None:
                    p.launch = {"power": 0.7, "estilo": "potente"}
            await self.start_battle()

    async def on_lancar(self, player, power, estilo):
        if self.fase != "lancamento" or player.launch is not None:
            return
        try:
            power = max(0.0, min(1.0, float(power)))
        except (TypeError, ValueError):
            power = 0.7
        if estilo not in ESTILOS:
            estilo = "potente"
        player.launch = {"power": power, "estilo": estilo}
        if all(p.launch is not None for p in self.players):
            if self.task:
                self.task.cancel()
            await self.start_battle()

    def make_top(self, idx, player):
        st = compute_stats(player.sel)
        side = -1 if idx == 0 else 1
        launch = player.launch or {"power": 0.7, "estilo": "potente"}
        power = launch["power"]
        estilo = launch.get("estilo", "potente")
        spin_dir = 1 if idx == 0 else -1
        spin = MAX_SPIN * (0.70 + 0.30 * power)
        x, z = side * 4.2, random.uniform(-1.5, 1.5)
        orbit_until, cent_mult = 0.0, 1.0

        if estilo == "rasante":
            # saque em rasante: entra veloz pela borda, girando em órbita larga
            spin *= 0.92
            x, z = side * 6.5, random.uniform(-1.0, 1.0)
            r = math.hypot(x, z) or 1e-6
            spd = 5.5 + 6.5 * power
            vx = -z / r * spd * spin_dir
            vz = x / r * spd * spin_dir
            orbit_until = 10.0
        elif estilo == "central":
            # saque central: entra devagar mirando o centro, prioriza estabilidade
            vx = -side * (2.0 + 2.5 * power)
            vz = -z * 0.3
            cent_mult = 1.35
        else:
            # saque potente: força total direto no adversário
            spin *= 1.05
            vx = -side * (4.0 + 6.0 * power)
            vz = random.uniform(-2.5, 2.5)

        return {
            "idx": idx, "st": st, "x": x, "z": z, "vx": vx, "vz": vz,
            "spin": spin, "max_spin": spin,
            "burst": 0.0, "alive": True, "causa": None,
            "spin_dir": spin_dir,
            "orbit_until": orbit_until, "cent_mult": cent_mult,
            "lunge_at": random.uniform(0.8, 1.8),
            "skill_ready": 3.0,  # habilidade libera após 3s de rodada
            "dash_until": 0.0, "shield_until": 0.0,
            "drain_until": 0.0, "quake_until": 0.0,
        }

    async def start_battle(self):
        print(f"[{self.codigo}] startBattle r{self.rodada} fase={self.fase}", flush=True)
        self.fase = "batalha"
        self.time = 0.0
        self.last_hit = -1.0
        self.tops = [self.make_top(i, p) for i, p in enumerate(self.players)]
        await self.broadcast({"t": "inicioBatalha", "rodada": self.rodada,
                              "placar": self.placar(),
                              "jogadores": self.jogadores_info()})
        self.task = asyncio.create_task(self._battle_loop())

    async def _battle_loop(self):
        try:
            while self.fase == "batalha":
                await self.step()
                await asyncio.sleep(DT)
        except asyncio.CancelledError:
            pass

    # ---- física ----
    async def step(self):
        self.time += DT
        a, b = self.tops
        for t in self.tops:
            await self.step_top(t)
        await self.collide(a, b)
        for t in self.tops:
            await self.maybe_skill(t)

        for t in self.tops:
            if t["alive"]:
                if t["spin"] <= 0:
                    t["spin"] = 0
                    t["alive"] = False
                    t["causa"] = "spin"
                elif t["burst"] >= 100:
                    t["alive"] = False
                    t["causa"] = "burst"
                    await self.broadcast({"t": "burst", "idx": t["idx"],
                                          "x": t["x"], "z": t["z"]})

        await self.broadcast(self.estado())

        mortos = [t for t in self.tops if not t["alive"]]
        if mortos:
            await self.end_round()
        elif self.time >= ROUND_TIME:
            ra, rb = a["spin"] / a["max_spin"], b["spin"] / b["max_spin"]
            if abs(ra - rb) < 0.02:
                await self.end_round(empate=True)
            else:
                perdedor = a if ra < rb else b
                perdedor["alive"] = False
                perdedor["causa"] = "tempo"
                await self.end_round()

    async def step_top(self, t):
        if not t["alive"]:
            return
        st = t["st"]
        r = math.hypot(t["x"], t["z"]) or 1e-6
        nx, nz = t["x"] / r, t["z"] / r
        ax = az = 0.0

        # inclinação da tigela puxa para o centro
        spin_ratio = t["spin"] / t["max_spin"]
        cent = st["centering"] * t["cent_mult"] * (1.4 if t["shield_until"] > self.time else 1.0)
        if spin_ratio < 0.35:
            # com pouco giro a beyblade cambaleia e deriva para fora
            cent *= 0.45 + spin_ratio * 1.6
        pull = 7.5 * cent * min(r, ARENA_R) / ARENA_R
        ax += -nx * pull
        az += -nz * pull

        # órbita (padrão de movimento da ponteira + estilo de saque)
        boost = 1.6 if self.time < t["orbit_until"] else 1.0
        orb = 4.5 * st["orbit"] * boost * spin_ratio * t["spin_dir"]
        ax += -nz * orb
        az += nx * orb

        # deriva aleatória: cada rodada é imprevisível, como na vida real
        wob = st["move_force"] * 0.10 * (1.0 - spin_ratio * 0.5)
        ax += random.uniform(-1, 1) * wob
        az += random.uniform(-1, 1) * wob

        # investidas periódicas: as beyblades se caçam pela arena
        if self.time >= t["lunge_at"]:
            t["lunge_at"] = self.time + random.uniform(1.0, 2.2)
            o = self.tops[1 - t["idx"]]
            if o["alive"]:
                dx, dz = o["x"] - t["x"], o["z"] - t["z"]
                dd = math.hypot(dx, dz) or 1e-6
                imp = (3.5 + st["dmg_mul"] * 2.0) * (0.5 + 0.5 * spin_ratio)
                t["vx"] += dx / dd * imp
                t["vz"] += dz / dd * imp

        # habilidade: investida
        if t["dash_until"] > self.time:
            o = self.tops[1 - t["idx"]]
            dx, dz = o["x"] - t["x"], o["z"] - t["z"]
            d = math.hypot(dx, dz) or 1e-6
            ax += dx / d * 48
            az += dz / d * 48

        # amortecimento de translação + teto de velocidade
        damp = max(0.0, 1 - 0.55 * DT)
        t["vx"] = t["vx"] * damp + ax * DT
        t["vz"] = t["vz"] * damp + az * DT
        vel = math.hypot(t["vx"], t["vz"])
        if vel > MAX_VEL:
            t["vx"] *= MAX_VEL / vel
            t["vz"] *= MAX_VEL / vel
            vel = MAX_VEL
        t["x"] += t["vx"] * DT
        t["z"] += t["vz"] * DT

        # perda de rotação (andar rápido também gasta giro)
        decay = st["decay"] * (1.6 if t["dash_until"] > self.time else 1.0)
        decay += vel * 0.22
        t["spin"] -= decay * DT

        # parede / ring-out (sair é bem mais fácil pelos 3 bolsões do estádio)
        r2 = math.hypot(t["x"], t["z"])
        if r2 > ARENA_R - TOP_R:
            nx2, nz2 = t["x"] / r2, t["z"] / r2
            vr = t["vx"] * nx2 + t["vz"] * nz2
            if vr > 0:
                ang = math.atan2(t["z"], t["x"])
                no_bolsao = any(
                    abs((ang - p + math.pi) % (2 * math.pi) - math.pi) < POCKET_HALF
                    for p in POCKETS)
                limite = RINGOUT_V * (0.75 + st["mass"] * 0.18)
                limite *= 0.78 if no_bolsao else 1.7
                if t["shield_until"] > self.time:
                    limite += 3.0
                if vr > limite:
                    t["alive"] = False
                    t["causa"] = "out"
                    await self.broadcast({"t": "ringout", "idx": t["idx"],
                                          "vx": t["vx"], "vz": t["vz"]})
                    return
                t["vx"] -= nx2 * vr * 1.7
                t["vz"] -= nz2 * vr * 1.7
                # cavalga a parede no sentido do próprio giro
                kick = 1.2 * spin_ratio * t["spin_dir"]
                t["vx"] += -nz2 * kick
                t["vz"] += nx2 * kick
                t["spin"] -= vr * 2.5
                await self.broadcast({"t": "hit", "x": t["x"], "z": t["z"],
                                      "f": vr * 0.6})
            excesso = r2 - (ARENA_R - TOP_R)
            t["x"] -= nx2 * excesso
            t["z"] -= nz2 * excesso

    async def collide(self, a, b):
        if not (a["alive"] and b["alive"]):
            return
        dx, dz = b["x"] - a["x"], b["z"] - a["z"]
        d = math.hypot(dx, dz)
        if d >= TOP_R * 2:
            return
        nx = dx / d if d > 1e-6 else 1.0
        nz = dz / d if d > 1e-6 else 0.0

        # separa os corpos (ponderado pela massa)
        ma, mb = a["st"]["mass"], b["st"]["mass"]
        overlap = TOP_R * 2 - d
        tot = ma + mb
        a["x"] -= nx * overlap * (mb / tot)
        a["z"] -= nz * overlap * (mb / tot)
        b["x"] += nx * overlap * (ma / tot)
        b["z"] += nz * overlap * (ma / tot)

        rel = (a["vx"] - b["vx"]) * nx + (a["vz"] - b["vz"]) * nz
        if rel <= 0 or self.time - self.last_hit < 0.07:
            return
        self.last_hit = self.time

        qa = 2.2 if a["quake_until"] > self.time else 1.0
        qb = 2.2 if b["quake_until"] > self.time else 1.0
        shield_a = a["shield_until"] > self.time
        shield_b = b["shield_until"] > self.time

        # impulso (o giro injeta energia extra: e > 1)
        e = 1.3
        j = (1 + e) * rel / (1 / ma + 1 / mb)
        kb_a = (0.45 if shield_a else 1.0) * qb
        kb_b = (0.45 if shield_b else 1.0) * qa
        a["vx"] -= nx * j / ma * kb_a
        a["vz"] -= nz * j / ma * kb_a
        b["vx"] += nx * j / mb * kb_b
        b["vz"] += nz * j / mb * kb_b

        # desvio tangencial caótico proporcional ao ataque
        jt = (random.random() - 0.5) * (a["st"]["dmg_mul"] + b["st"]["dmg_mul"]) * 3.2
        a["vx"] += -nz * jt
        a["vz"] += nx * jt
        b["vx"] -= -nz * jt
        b["vz"] -= nx * jt

        # fricção de superfície: as bordas girando deflectem as trajetórias
        surf = 2.0 * (a["spin"] / a["max_spin"] * a["spin_dir"]
                      - b["spin"] / b["max_spin"] * b["spin_dir"])
        a["vx"] += -nz * surf * 0.5
        a["vz"] += nx * surf * 0.5
        b["vx"] -= -nz * surf * 0.5
        b["vz"] -= nx * surf * 0.5

        # dano à rotação
        base = rel * 7.0
        dmg_b = base * a["st"]["dmg_mul"] * b["st"]["dmg_taken"] * qa
        dmg_a = base * b["st"]["dmg_mul"] * a["st"]["dmg_taken"] * qb
        if shield_b:
            dmg_b *= 0.35
            dmg_a += base * 0.3   # reflexo da muralha
        if shield_a:
            dmg_a *= 0.35
            dmg_b += base * 0.3
        if a["drain_until"] > self.time:
            a["spin"] = min(a["max_spin"], a["spin"] + dmg_b * 0.6)
        if b["drain_until"] > self.time:
            b["spin"] = min(b["max_spin"], b["spin"] + dmg_a * 0.6)
        a["spin"] -= dmg_a
        b["spin"] -= dmg_b

        # medidor de burst
        a["burst"] += base * b["st"]["dmg_mul"] * a["st"]["burst_taken"] * 0.24 * qb
        b["burst"] += base * a["st"]["dmg_mul"] * b["st"]["burst_taken"] * 0.24 * qa

        # maré esmagadora é consumida no impacto
        if qa > 1:
            a["quake_until"] = 0.0
        if qb > 1:
            b["quake_until"] = 0.0

        await self.broadcast({"t": "hit", "x": (a["x"] + b["x"]) / 2,
                              "z": (a["z"] + b["z"]) / 2, "f": rel})

    def estado(self):
        tops = []
        for t in self.tops:
            tops.append({
                "x": round(t["x"], 3), "z": round(t["z"], 3),
                "s": round(max(0.0, t["spin"] / t["max_spin"]), 4),
                "b": round(min(1.0, t["burst"] / 100.0), 4),
                "a": 1 if t["alive"] else 0,
                "dash": 1 if t["dash_until"] > self.time else 0,
                "shield": 1 if t["shield_until"] > self.time else 0,
                "drain": 1 if t["drain_until"] > self.time else 0,
                "quake": 1 if t["quake_until"] > self.time else 0,
                "cd": round(max(0.0, t["skill_ready"] - self.time), 2),
            })
        return {"t": "estado", "time": round(self.time, 2), "tops": tops}

    async def maybe_skill(self, t):
        """Habilidades disparam sozinhas quando a situação favorece (com sorte)."""
        if self.fase != "batalha" or not t["alive"] or self.time < t["skill_ready"]:
            return
        o = self.tops[1 - t["idx"]]
        if not o["alive"]:
            return
        d = math.hypot(o["x"] - t["x"], o["z"] - t["z"])
        sid = t["st"]["skill"]["id"]
        r = random.random()
        fire = False
        if sid == "dash":
            fire = d > 2.5 and r < 0.06
        elif sid == "shield":
            fire = d < 3.5 and r < 0.07
        elif sid == "recover":
            fire = t["spin"] / t["max_spin"] < 0.5 and r < 0.08
        elif sid == "drain":
            fire = d < 4.0 and r < 0.07
        elif sid == "quake":
            fire = r < 0.04
        if fire:
            await self.usar_skill(t["idx"])

    async def usar_skill(self, idx):
        if self.fase != "batalha":
            return
        t = self.tops[idx]
        if not t["alive"] or self.time < t["skill_ready"]:
            return
        t["skill_ready"] = self.time + SKILL_CD
        sid = t["st"]["skill"]["id"]
        if sid == "dash":
            t["dash_until"] = self.time + 1.2
        elif sid == "shield":
            t["shield_until"] = self.time + 2.5
        elif sid == "recover":
            t["spin"] = min(t["max_spin"], t["spin"] + t["max_spin"] * 0.12)
        elif sid == "drain":
            t["drain_until"] = self.time + 3.0
        elif sid == "quake":
            t["quake_until"] = self.time + 4.0
        await self.broadcast({"t": "skillUsada", "idx": idx,
                              "skill": t["st"]["skill"]})

    # ---- fim de rodada / partida ----
    async def end_round(self, empate=False):
        if self.fase != "batalha":
            return
        self.fase = "fimRodada"
        a, b = self.tops
        vencedor = None
        causa = "empate"
        pontos = 0
        if not empate:
            vivos = [t for t in self.tops if t["alive"]]
            if len(vivos) == 1:
                v = vivos[0]
                perdedor = self.tops[1 - v["idx"]]
                vencedor = v["idx"]
                causa = perdedor["causa"]
                pontos = {"spin": 1, "tempo": 1, "out": 2, "burst": 2}.get(causa, 1)
                self.players[vencedor].score += pontos
            else:
                causa = "empate"  # os dois caíram no mesmo tick
        print(f"[{self.codigo}] fimRodada r{self.rodada} vencedor={vencedor} "
              f"causa={causa} pontos={pontos} placar={self.placar()}", flush=True)
        await self.broadcast({"t": "fimRodada", "vencedor": vencedor,
                              "causa": causa, "pontos": pontos,
                              "placar": self.placar(),
                              "tempo": round(self.time, 1)})
        self.task = asyncio.create_task(self._apos_rodada())

    async def _apos_rodada(self):
        await asyncio.sleep(4.5)
        campeao = next((i for i, p in enumerate(self.players)
                        if p.score >= WIN_SCORE), None)
        print(f"[{self.codigo}] aposRodada placar={self.placar()} campeao={campeao}",
              flush=True)
        if campeao is not None:
            self.fase = "fimPartida"
            for p in self.players:
                p.revanche = p.is_bot  # bots sempre topam a revanche
            await self.broadcast({"t": "fimPartida", "vencedor": campeao,
                                  "placar": self.placar(),
                                  "nome": self.players[campeao].nome})
        else:
            await self.start_launch()

    async def on_revanche(self, player):
        if self.fase != "fimPartida":
            return
        player.revanche = True
        await self.broadcast({"t": "revancheStatus",
                              "prontos": sum(1 for p in self.players if p.revanche)})
        if len(self.players) == 2 and all(p.revanche for p in self.players):
            for p in self.players:
                p.score = 0
                p.pronto = False
                p.revanche = False
                if p.is_bot:
                    p.sel = random_sel()
                    p.pronto = True
            self.rodada = 0
            self.fase = "escolha"
            await self.broadcast({"t": "faseEscolha",
                                  "jogadores": self.jogadores_info()})
            await self.send_lobby()

    async def remove_ws(self, ws):
        if ws in self.espectadores:
            self.espectadores.remove(ws)
            await self.send_lobby()
            return
        saiu = next((p for p in self.players if p.ws is ws), None)
        if saiu:
            if self.task:
                self.task.cancel()
            self.players.remove(saiu)
            self.fase = "escolha"
            for p in self.players:
                p.score = 0
                p.pronto = False
            await self.broadcast({"t": "saiu", "nome": saiu.nome,
                                  "jogadores": self.jogadores_info()})
            for i, p in enumerate(self.players):
                if p.ws is None:
                    continue
                try:
                    await p.ws.send_json({"t": "reidx", "idx": i})
                except Exception:
                    pass
        # sala só com bots não fica viva
        if not any(not p.is_bot for p in self.players):
            self.players = [p for p in self.players if not p.is_bot]
        if not self.players and not self.espectadores:
            rooms.pop(self.codigo, None)


# ---------------- HTTP / WebSocket ----------------
async def index(request):
    return web.FileResponse(PUBLIC / "index.html")


async def parts_js(request):
    data = {"LAYERS": LAYERS, "DISKS": DISKS, "DRIVERS": DRIVERS}
    body = "window.PARTS = " + json.dumps(data, ensure_ascii=False) + ";"
    return web.Response(text=body, content_type="application/javascript")


async def ws_handler(request):
    ws = web.WebSocketResponse(heartbeat=25)
    await ws.prepare(request)
    room = None
    player = None

    async for msg in ws:
        if msg.type != WSMsgType.TEXT:
            continue
        try:
            m = json.loads(msg.data)
        except Exception:
            continue
        t = m.get("t")

        if t in ("criar", "criarBot"):
            codigo = new_code()
            room = Room(codigo)
            rooms[codigo] = room
            player = Player(ws, str(m.get("nome", "")))
            room.players.append(player)
            if t == "criarBot":
                bot = Player(None, random.choice(BOT_NOMES), is_bot=True)
                bot.sel = random_sel()
                bot.pronto = True
                room.players.append(bot)
            await ws.send_json({"t": "sala", "codigo": codigo, "papel": "jogador",
                                "idx": 0, "fase": room.fase,
                                "jogadores": room.jogadores_info(),
                                "placar": room.placar()})
            await room.send_lobby()

        elif t == "entrar":
            codigo = str(m.get("codigo", "")).upper().strip()
            room = rooms.get(codigo)
            if not room:
                await ws.send_json({"t": "erro", "msg": "Sala não encontrada. Confira o código."})
                room = None
                continue
            if len(room.players) < 2 and room.fase == "escolha":
                player = Player(ws, str(m.get("nome", "")))
                room.players.append(player)
                papel, idx = "jogador", len(room.players) - 1
            else:
                room.espectadores.append(ws)
                papel, idx = "espectador", -1
            await ws.send_json({"t": "sala", "codigo": codigo, "papel": papel,
                                "idx": idx, "fase": room.fase,
                                "jogadores": room.jogadores_info(),
                                "placar": room.placar()})
            await room.send_lobby()

        elif room is None:
            continue

        elif t == "pecas" and player:
            sel = m.get("sel")
            if room.fase == "escolha" and valid_sel(sel):
                player.sel = {"layer": sel["layer"], "disk": sel["disk"],
                              "driver": sel["driver"]}
                player.pronto = True
                await room.send_lobby()
                await room.try_start()

        elif t == "lancar" and player:
            await room.on_lancar(player, m.get("power", 0.7), m.get("estilo"))

        elif t == "revanche" and player:
            await room.on_revanche(player)

    if room is not None:
        await room.remove_ws(ws)
    return ws


def main():
    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/ws", ws_handler)
    app.router.add_get("/parts.js", parts_js)
    app.router.add_static("/", PUBLIC)
    print(f"Arena Beyblade rodando na porta {PORT}", flush=True)
    web.run_app(app, host="0.0.0.0", port=PORT, print=None)


if __name__ == "__main__":
    main()
