# Segurança — Sutil Karaokê

Resumo das correções aplicadas e o que **você precisa fazer no Firebase** para concluí-las.

## ✅ Já corrigido no código

1. **XSS na fila** — o nome da música/cantor/mesa agora é "escapado" antes de ir
   pra tela (`esc()` em `index.html`). Não é mais possível injetar HTML/script
   pela caixa de pedido.

2. **Senha do DJ não fica mais no código** — removida a senha fixa `142536`.
   O acesso de DJ agora é por **conta Google autorizada** (lista `/admins`).

## 🔧 O que você precisa fazer (uma vez) no console do Firebase

### Passo 1 — Descobrir o seu ID de DJ
1. Abra o site e faça **login com o Google** (a conta que será do DJ).
2. Toque no botão **DJ** (engrenagem). Vai aparecer "Acesso restrito" com o
   **seu identificador (UID)**. Toque em **Copiar meu ID**.

### Passo 2 — Autorizar o DJ
No [console do Firebase](https://console.firebase.google.com/) →
**Realtime Database** → aba **Dados**, crie o nó:

```
admins
 └── <SEU_UID_AQUI>: true
```

(Repita para cada pessoa que pode ser DJ.) Depois é só tocar em **DJ** de novo
no site — o painel abre automaticamente.

### Passo 3 — Aplicar as regras de segurança
No console → **Realtime Database** → aba **Regras**, cole o conteúdo de
[`database.rules.json`](database.rules.json) e clique em **Publicar**.

Essas regras garantem, no servidor (não dá pra burlar pelo navegador):
- Só usuários logados leem a fila.
- **Cada conta tem no máximo 1 música na fila.** O pedido é gravado na chave da
  própria conta (`fila_karaoke/{uid}`), então é impossível pedir pela conta do
  amigo ou ter duas músicas ao mesmo tempo. Só dá pra pedir outra **depois que o
  DJ remover/marcar como cantada** a atual.
- Cada cliente só cria/edita/remove **o próprio** pedido (não dá pra mexer no dos outros nem se passar por outro `uid`).
- Só quem está em `/admins` pode **reordenar, remover qualquer música, abrir/fechar a fila e definir o "Tocando Agora"**.
- Limite de tamanho nos campos (anti-spam).

## ⚠️ Importante ao publicar (uma vez)

O formato de armazenamento da fila mudou (agora é por conta, `fila_karaoke/{uid}`).
**Limpe a fila atual uma vez** no console do Firebase (apague o nó `fila_karaoke`)
ao subir esta versão, para não misturar pedidos no formato antigo com os novos.
Depois disso funciona normalmente — a fila se renova sozinha a cada noite.

## 🔎 Busca do YouTube

A busca usa a **YouTube Data API v3**. Cole sua chave em `index.html`
(`const YOUTUBE_API_KEY = ""`), restrita por **Referenciador HTTP** ao seu domínio.
A busca já adiciona "karaokê" automaticamente para priorizar versões de karaokê.

> Enquanto você não aplicar o Passo 3, o site segue funcionando, mas sem a
> proteção do servidor. O acesso de DJ (Passos 1 e 2) já funciona assim que
> você cadastrar seu UID em `/admins`.
