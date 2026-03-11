const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
let qrAtual = null;

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "bot-fauesp",
    dataPath: "/app/.wwebjs_auth"
  }),
puppeteer: {
    headless: true,
    executablePath: '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--user-data-dir=/tmp/chromium'
    ],
    protocolTimeout: 180000
  }
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let etapa = {};

const aproveitamento = {
  "alagoas": "Dispensa Completa",
  "são paulo": "Dispensa Completa",
  "bahia": "4 disciplinas + 4 Atividades em 6 meses",
  "ceará": "7 disciplinas em 6 meses",
  "espírito santo": "14 disciplinas + 4 Atividades em 12 meses",
  "maranhão": "3 disciplinas + 4 atividades em 6 meses",
  "mato grosso": "6 disciplinas + 4 atividades em 8 meses",
  "mato grosso do sul": "3 disciplinas + 4 atividades em 4 meses",
  "minas gerais": "3 disciplinas + Atividades em 3 meses",
  "pará": "3 disciplinas + Atividades em 3 meses",
  "paraíba": "6 disciplinas + Atividades em 6 meses",
  "paraná": "6 disciplinas em 3 meses",
  "pernambuco": "3 disciplinas + Atividades em 3 meses",
  "sergipe": "4 disciplinas em 3 meses",
  "rio grande do norte": "3 disciplinas + 4 Atividades em 6 meses",
  "rio grande do sul": "3 disciplinas + 4 Atividades em 6 meses",
  "tocantins": "7 disciplinas + 4 atividades em 9 meses"
};

const siglas = {
  "al": "alagoas",
  "sp": "são paulo",
  "ba": "bahia",
  "ce": "ceará",
  "es": "espírito santo",
  "ma": "maranhão",
  "mt": "mato grosso",
  "ms": "mato grosso do sul",
  "mg": "minas gerais",
  "pa": "pará",
  "pb": "paraíba",
  "pr": "paraná",
  "pe": "pernambuco",
  "se": "sergipe",
  "rn": "rio grande do norte",
  "rs": "rio grande do sul",
  "to": "tocantins"
};

const arquivos = {};
const listaArquivos = {
  video1: './video1.mp4',
  video2: './video2.mp4',
  licenciaturas: './licenciaturas.jpeg',
  pos: './posgraduacao.pdf',
  planos: './planos.pdf',
  audio: './audiok1.ogg'
};

function carregarArquivos() {
  for (const [nome, caminho] of Object.entries(listaArquivos)) {
    try {
      if (fs.existsSync(caminho)) {
        arquivos[nome] = MessageMedia.fromFilePath(caminho);
        console.log(`✅ Arquivo carregado: ${caminho}`);
      } else {
        console.log(`⚠️ Arquivo não encontrado: ${caminho}`);
      }
    } catch (erro) {
      console.log(`❌ Erro ao carregar ${caminho}:`, erro.message);
    }
  }
}

client.on('qr', async qr => {
  qrAtual = qr;
  console.log('QR gerado! Acesse /qr para escanear');
});

client.on('ready', () => {
  console.log("✅ Bot conectado!");
  carregarArquivos();
});

client.on('auth_failure', msg => {
  console.error('❌ Falha de autenticação:', msg);
});

client.on('disconnected', reason => {
  console.log('⚠️ Bot desconectado:', reason);
});

async function processarMensagem(message) {
  try {
    if (message.fromMe) return;
    if (message.from.includes('@g.us')) return;
    if (message.from.includes('status@broadcast')) return;

    const contato = message.from;
    const msg = message.body.toLowerCase().trim();

    console.log(`[${contato}] Mensagem: "${msg}" | Etapa: ${etapa[contato]}`);

    if (etapa[contato] === "finalizado") return;

    if (!etapa[contato]) {
      etapa[contato] = "estado";
      await message.reply(`Falaaa Policial Militar 💀\n\nTudo na paz?\n\nVocê é de qual estado???`);
      return;
    }

    if (etapa[contato] === "estado") {
      let estadoDetectado = null;

      for (let estado in aproveitamento) {
        if (msg.includes(estado)) {
          estadoDetectado = estado;
          break;
        }
      }

      if (!estadoDetectado) {
        const msgLimpa = msg.trim();
        if (siglas[msgLimpa]) {
          estadoDetectado = siglas[msgLimpa];
        }
      }

      if (!estadoDetectado) {
        await message.reply(
          "Não consegui identificar o estado 😅\n\n" +
          "Pode digitar o nome completo ou a sigla, por exemplo:\n" +
          "*São Paulo* ou *SP*\n" +
          "*Minas Gerais* ou *MG*"
        );
        return;
      }

      etapa[contato] = "finalizado";

      let info = aproveitamento[estadoDetectado];

      await message.reply(
        `Sensacional, Estado do *${estadoDetectado.toUpperCase()}* 🇧🇷\n\n` +
        `Aí sim, um dos Melhores Estados do Brasil 🇧🇷\n\n` +
        `Por aqui, 1º Sgt PM Kaleu, da Polícia Militar do Estado de São Paulo, atualmente eu trabalho na Escola Superior de Sargentos. Vou te encaminhar um vídeo explicativo do que é, e como é essa Diplomação em Gestão Pública realizada pela Faculdade FAUESP, com o aproveitamento da nossa Formação Policial.\n\n` +
        `Obs: Informo que Hoje a Faculdade FAUESP, está presente em 22 Estados, dos quais os Estados de SÃO PAULO e ALAGOAS, o referido aproveitamento escolar ocorre com 100%, NÃO sendo necessário o aluno Policial cursar mais NENHUMA disciplina e/ou Atividade.\n\n` +
        `• Policial Militar de outros Estados, por favor, Confira a Tabela de Aproveitamento de Estudo do seu Estado e veja quantas disciplinas, APENAS, vc deverá cursar, bem como o prazo mínimo para solicitar a conclusão!!!\n\n` +
        `Pra cimaaaaa 🚀🚀🚀`
      );

      await delay(2000);
      await client.sendMessage(contato, `📚 *Aproveitamento da sua formação*\n\n${info}`);
      await delay(3000);

      if (arquivos.video1) {
        try {
          await client.sendMessage(contato, arquivos.video1, { caption: "🎥 Assista esse vídeo explicativo" });
        } catch (e) { console.log("Erro video1:", e.message); }
      }

      await delay(5000);

      if (arquivos.video2) {
        try {
          await client.sendMessage(contato, arquivos.video2, { caption: "📌 Mais detalhes sobre a diplomação" });
        } catch (e) { console.log("Erro video2:", e.message); }
      }

      await delay(3000);
      await client.sendMessage(contato,
        `🚨🚨🚨\nAlém da Diplomação em Gestão Pública a FAUESP também oferece:\n\n• 15 Licenciaturas\n• Bacharel em Educação Física\n• 93 Pós-graduações`
      );
      await delay(3000);

      if (arquivos.licenciaturas) {
        try {
          await client.sendMessage(contato, arquivos.licenciaturas, { caption: "📚 Licenciaturas disponíveis" });
        } catch (e) { console.log("Erro licenciaturas:", e.message); }
      }

      await delay(3000);

      if (arquivos.pos) {
        try {
          await client.sendMessage(contato, arquivos.pos, { caption: "📄 Opções de Pós-graduação" });
        } catch (e) { console.log("Erro pos:", e.message); }
      }

      await delay(3000);

      if (arquivos.planos) {
        try {
          await client.sendMessage(contato, arquivos.planos, {
            caption: "💰 Planos e valores\n\n🔥 *PLANOS EM PROMOÇÃO*\nPlanos 4 e 7 - estão em promoção até 31MAR26"
          });
        } catch (e) { console.log("Erro planos:", e.message); }
      }

      await delay(2000);
      await client.sendMessage(contato,
        `Matrícula 👇\n\nhttps://forms.zohopublic.com/FAUESP/form/RequerimentodeMatrculaAdministradorNovo/formperma/3C_4ORYAJv1zrhKuU7Q6pnyTtQQRuyI3jswnQ5JFobs?num=13`
      );
      await delay(3000);
      await client.sendMessage(contato, `🎧 Escuta esse áudio rápido antes de entrar no grupo 👇`);
      await delay(2000);

      if (arquivos.audio) {
        try {
          await client.sendMessage(contato, arquivos.audio, { sendAudioAsVoice: true });
        } catch (e) { console.log("Erro audio:", e.message); }
      }

      await delay(3000);
      await client.sendMessage(contato,
        `👮‍♂️ Grupo exclusivo de policiais:\n\nhttps://chat.whatsapp.com/KesR0ns7tPx8EdDtz9I8rK?mode=gi_t`
      );
    }

  } catch (e) {
    console.error(`❌ Erro no bot [${message.from}]:`, e.message);
    delete etapa[message.from];
  }
}

client.on('message', processarMensagem);

app.get('/qr', async (req, res) => {
  if (!qrAtual) {
    return res.send(`
      <h2>⏳ Aguardando QR...</h2>
      <p>O QR ainda não foi gerado. Aguarde alguns segundos.</p>
      <script>setTimeout(()=>location.reload(), 3000)</script>
    `);
  }
  const qrImage = await QRCode.toDataURL(qrAtual);
  res.send(`
    <html><body style="text-align:center;font-family:Arial">
    <h2>📱 Escaneie com seu WhatsApp</h2>
    <img src="${qrImage}" width="300"/>
    <p>WhatsApp → Aparelhos Conectados → Conectar aparelho</p>
    </body></html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Servidor rodando na porta ${PORT}`));

client.initialize();