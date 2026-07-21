# ⚡ Arena Beyblade

Jogo multiplayer online inspirado em Beyblade, em arena 3D no navegador.
Servidor em Python (aiohttp + WebSockets), cliente em Three.js.

## Como rodar

```
pip install aiohttp
python server.py
```

Abra `http://localhost:3000` no navegador.

## Como jogar com o time

- **Mesma rede (escritório/VPN):** descubra seu IP com `ipconfig` (campo IPv4) e
  passe para os colegas: `http://SEU_IP:3000`. Pode ser preciso liberar a porta
  3000 no Firewall do Windows na primeira vez.
- **Pela internet:** veja "Publicar online" abaixo.

## Publicar online (grátis)

O projeto já está pronto para deploy: `server.py` lê a porta de `PORT`, e há
`requirements.txt`, `render.yaml` e `Dockerfile` prontos.

### Opção A — Render (recomendado)

1. Suba a pasta para um repositório no GitHub:
   ```
   cd beyblade-arena
   git init && git add . && git commit -m "Arena Beyblade"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/arena-beyblade.git
   git push -u origin main
   ```
2. Crie a conta em [render.com](https://render.com) (dá para entrar com o GitHub).
3. **New → Web Service** → escolha o repositório.
4. O Render lê o `render.yaml` sozinho. Confira: runtime **Python**, build
   `pip install -r requirements.txt`, start `python server.py`, plano **Free**.
5. **Create Web Service**. Em ~2 min sai a URL pública
   (`https://arena-beyblade.onrender.com`) — é essa que você manda para o time.

> No plano free o serviço hiberna após ~15 min sem acesso e leva ~50s para
> acordar no primeiro acesso. Depois disso roda normal.

### Opção B — Hugging Face Spaces (sem precisar de Git)

1. Crie a conta em [huggingface.co](https://huggingface.co).
2. **New Space** → SDK **Docker** → visibilidade **Public**.
3. Arraste os arquivos do projeto (incluindo a pasta `public/` e o `Dockerfile`)
   na aba **Files**.
4. O Space builda sozinho e a URL fica
   `https://SEU_USUARIO-arena-beyblade.hf.space`.

### Opção C — Túnel rápido (temporário)

Sem conta em hospedagem, mas depende do seu PC ligado:
`ngrok http 3000` ou Tailscale.

Um jogador **cria a sala** e compartilha o código de 4 letras. O segundo entra
como oponente; os demais entram como **espectadores** com o mesmo código.

Para treinar sozinho, use **"Treinar contra Bot"** no menu — o bot monta uma
combinação aleatória a cada partida e sempre topa revanche.

## Modalidades

| Modo | Beyblades | Ring-out | Objetivo |
|---|---|---|---|
| **Duelo** | 2 | Sim, pelos 3 bolsões | 3 pontos |
| **🔥 CAOS** | 5 | **Impossível** — parede sólida | 2 rodadas vencidas |

No **CAOS** a arena entra sempre cheia: os lugares que sobrarem viram bots.
Como ninguém é arremessado para fora, é briga até a morte — vence quem ainda
estiver girando no final. O nome de cada jogador flutua sobre a sua beyblade.

Ficar pronto no CAOS **não** inicia a partida: quem criou a sala tem o botão
**"Começar agora"** (liberado quando todos os presentes estão prontos), para
dar tempo do time inteiro entrar. Com os 5 lugares ocupados por gente, começa
sozinho.

## Regras (estilo Beyblade Burst)

| Final | Como acontece | Pontos |
|---|---|---|
| **Spin Finish** | A beyblade do oponente para de girar | 1 |
| **Ring-Out Finish** | O oponente é arremessado pra fora da arena | 2 |
| **Burst Finish** | O medidor de burst do oponente chega a 100% | 2 |
| Tempo esgotado (1min30) | Vence quem tiver mais rotação | 1 |

**Vence a partida quem fizer 3 pontos primeiro.**

## Montagem da beyblade

Cada beyblade combina 3 peças — os stats somam e a combinação define o estilo:

- **Camada** (5 opções): define ataque/defesa e a **habilidade especial**
  (tecla ESPAÇO na batalha, cooldown de 8s);
- **Disco** (4 opções): peso, dano e estabilidade;
- **Ponteira** (4 opções): padrão de movimento na arena (ficar no centro,
  correr pela borda, etc.) e consumo de rotação.

## Controles

Como no jogo real: sua única jogada é o **lançamento** — depois é torcer!

- **Estilo de saque:** 💥 Potente (força total, +giro), 🌀 Rasante (entra veloz
  em órbita pela borda — agressivo, mas arriscado) ou 🛡️ Central (mira o centro
  e prioriza estabilidade);
- **Força:** ESPAÇO/clique no pico da barra (mais força = mais rotação e
  velocidade inicial);
- **Habilidades:** disparam automaticamente quando a situação favorece
  (cooldown de 8s) — a combinação de peças define qual habilidade sua
  beyblade tem.
