const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
let qrAtual = null;
let clientePronto = false;

const URLS = {
  video1:        'https://res.cloudinary.com/dkouzu5ho/video/upload/v1773239831/video1_vx1msc.mp4',
  video2:        'https://res.cloudinary.com/dkouzu5ho/video/upload/v1773239831/video2_nyxew7.mp4',
  audio:         'https://res.cloudinary.com/dkouzu5ho/video/upload/v1773239830/audiok1_hh2sm6.ogg',
  licenciaturas: 'https://res.cloudinary.com/dkouzu5ho/image/upload/v1773239831/licenciaturas_zqtt5k.jpg'
};

const PDF = {
  pos:    './posgraduacao.pdf',
  planos: './planos.pdf'
};

const arquivosPDF = {};

function carregarPDFs() {
  for (const [nome, caminho] of Object.entries(PDF)) {
    try {
      if (fs.existsSync(caminho)) {
        arquivosPDF[nome] = MessageMedia.fromFilePath(caminho);
        console.log(`✅ PDF carregado: ${caminho}`);
      } else {
        console.log(`⚠️ PDF não encontrado: ${caminho}`);
      }
    } catch (e) {
      console.log(`❌ Erro PDF ${nome}:`, e.message);
    }
  }
}

function criarCliente() {
  return new Client({
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
}

let client = criarCliente();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enviarUrlComRetry(contato, url, opcoes, tentativas = 5) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const media = await MessageMedia.fromUrl(url, { unsafeMime: true });
      await client.sendMessage(contato, media, opcoes);
      return true;
    } catch (e) {
      console.log(`⚠️ Tentativa ${i + 1} falhou:`, e.message);
      if (i < tentativas - 1) await delay(6000);
    }
  }
  console.log(`❌ Falhou após ${tentativas} tentativas`);
  return false;
}

async function enviarPDFComRetry(contato, media, opcoes, tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      await client.sendMessage(contato, media, opcoes);
      return true;
    } catch (e) {
      console.log(`⚠️ Tentativa PDF ${i + 1} falhou:`, e.message);
      if (i < tentativas - 1) await delay(4000);
    }
  }
  return false;
}

let etapa = {};

// Estados com múltiplas categorias mostram todas as opções
const aproveitamento = {
  "alagoas":            "✅ Dispensa Completa",
  "amazonas":           "3 disciplinas + Atividades em 3 meses",
  "bahia":              "4 disciplinas + 4 Atividades em 6 meses",
  "ceará":              "7 disciplinas em 6 meses",
  "espírito santo":     "14 disciplinas + 4 Atividades em 12 meses",
  "força aérea":        "4 disciplinas + 4 Atividades em 6 meses",
  "gcm paranaguá":      "5 Disciplinas + 4 Atividades em 6 meses",
  "maranhão":           "3 disciplinas + 4 atividades em 6 meses",
  "mato grosso":        "6 disciplinas + 4 atividades em 8 meses",
  "mato grosso do sul": "3 disciplinas + 4 atividades em 4 meses",
  "minas gerais":       "• PM: 3 disciplinas + Atividades em 3 meses\n• Bombeiros: 3 disciplinas + Atividades em 3 meses",
  "pará":               "• PM: 3 disciplinas + Atividades em 3 meses\n• Bombeiro: 7 disciplinas em 6 meses",
  "paraíba":            "6 disciplinas + Atividades em 6 meses",
  "paraná":             "• PM: 6 disciplinas em 3 meses\n• Bombeiro: 6 disciplinas + 4 atividades em 8 meses",
  "pernambuco":         "3 disciplinas + Atividades em 3 meses",
  "piauí":              "• Soldado: 3 disciplinas + 4 Atividades em 6 meses\n• Bombeiros: 6 disciplinas + 4 Atividades em 6 meses",
  "são paulo":          "✅ Dispensa Completa",
  "sergipe":            "4 disciplinas em 3 meses",
  "rondônia":           "• A partir de 2010: 6 disciplinas em 3 meses\n• Anterior a 2010: 13 disciplinas em 6 meses",
  "roraima":            "• Soldado: 16 disciplinas + Atividades em 15 meses\n• Cabo: 7 disciplinas + Atividades em 8 meses\n• Sargento: 3 disciplinas + Atividades em 4 meses",
  "rio de janeiro":     "Soldado: 3 disciplinas + 4 Atividades em 6 meses",
  "rio grande do norte":"3 disciplinas + 4 Atividades em 6 meses",
  "rio grande do sul":  "3 disciplinas + 4 Atividades em 6 meses",
  "tocantins":          "7 disciplinas + 4 atividades em 9 meses"
};

const siglas = {
  "al": "alagoas",
  "am": "amazonas",
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
  "pi": "piauí",
  "sp": "são paulo",
  "se": "sergipe",
  "ro": "rondônia",
  "rr": "roraima",
  "rj": "rio de janeiro",
  "rn": "rio grande do norte",
  "rs": "rio grande do sul",
  "to": "tocantins"
};

function registrarEventos() {
  client.on('qr', async qr => {
    qrAtual = qr;
    clientePronto = false;
    console.log('QR gerado! Acesse /qr para escanear');
  });

  client.on('ready', async () => {
    console.log("✅ Bot conectado!");
    clientePronto = true;
    carregarPDFs();
  });

  client.on('auth_failure', msg => {
    console.error('❌ Falha de autenticação:', msg);
    clientePronto = false;
  });

  client.on('disconnected', async reason => {
    console.log('⚠️ Bot desconectado:', reason);
    clientePronto = false;
    console.log('🔄 Reconectando em 10 segundos...');
    await delay(10000);
    try {
      client = criarCliente();
      registrarEventos();
      await client.initialize();
    } catch (e) {
      console.error('❌ Erro ao reconectar:', e.message);
    }
  });

  client.on('message', processarMensagem);
}

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

      // Verifica sigla exata
      if (siglas[msg]) {
        estadoDetectado = siglas[msg];
      }

      // Verifica nome completo ou parcial
      if (!estadoDetectado) {
        for (let estado in aproveitamento) {
          if (msg.includes(estado)) { estadoDetectado = estado; break; }
        }
      }

      // Verifica casos especiais por palavras-chave
      if (!estadoDetectado) {
        if (msg.includes("forca aerea") || msg.includes("força aérea") || msg.includes("fab")) estadoDetectado = "força aérea";
        if (msg.includes("gcm") || msg.includes("paranagua") || msg.includes("paranaguá")) estadoDetectado = "gcm paranaguá";
        if (msg.includes("rondonia") || msg.includes("rondônia")) estadoDetectado = "rondônia";
        if (msg.includes("roraima")) estadoDetectado = "roraima";
        if (msg.includes("piaui") || msg.includes("piauí")) estadoDetectado = "piauí";
        if (msg.includes("rio de janeiro") || msg === "rj") estadoDetectado = "rio de janeiro";
      }

      if (!estadoDetectado) {
        await message.reply(
          "Não consegui identificar o estado 😅\n\n" +
          "Pode digitar o nome completo ou a sigla, por exemplo:\n" +
          "*São Paulo* ou *SP*\n" +
          "*Minas Gerais* ou *MG*\n" +
          "*Roraima* ou *RR*"
        );
        return;
      }

      etapa[contato] = "finalizado";
      const info = aproveitamento[estadoDetectado];

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

      await enviarUrlComRetry(contato, URLS.video1, { caption: "🎥 Assista esse vídeo explicativo" });
      await delay(6000);

      await enviarUrlComRetry(contato, URLS.video2, { caption: "📌 Mais detalhes sobre a diplomação" });
      await delay(4000);

      await client.sendMessage(contato,
        `🚨🚨🚨\nAlém da Diplomação em Gestão Pública a FAUESP também oferece:\n\n• 15 Licenciaturas\n• Bacharel em Educação Física\n• 93 Pós-graduações`
      );
      await delay(3000);

      await enviarUrlComRetry(contato, URLS.licenciaturas, { caption: "📚 Licenciaturas disponíveis" });
      await delay(3000);

      if (arquivosPDF.pos) await enviarPDFComRetry(contato, arquivosPDF.pos, { caption: "📄 Opções de Pós-graduação" });
      await delay(3000);

      if (arquivosPDF.planos) await enviarPDFComRetry(contato, arquivosPDF.planos, {
        caption: "💰 Planos e valores\n\n🔥 *PLANOS EM PROMOÇÃO*\nPlanos 4 e 7 - estão em promoção até 31MAR26"
      });
      await delay(2000);

      await client.sendMessage(contato,
        `Matrícula 👇\n\nhttps://forms.zohopublic.com/FAUESP/form/RequerimentodeMatrculaAdministradorNovo/formperma/3C_4ORYAJv1zrhKuU7Q6pnyTtQQRuyI3jswnQ5JFobs?num=13`
      );
      await delay(3000);

      await client.sendMessage(contato, `🎧 Escuta esse áudio rápido antes de entrar no grupo 👇`);
      await delay(2000);

      await enviarUrlComRetry(contato, URLS.audio, { sendAudioAsVoice: true });
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

registrarEventos();

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