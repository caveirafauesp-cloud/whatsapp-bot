const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const https = require('https');
const http = require('http');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
let qrAtual = null;
let sock = null;

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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function baixarBuffer(url) {
  return new Promise((resolve, reject) => {
    const protocolo = url.startsWith('https') ? https : http;
    protocolo.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return baixarBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

let etapa = {};

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

function detectarEstado(msg) {
  if (siglas[msg]) return siglas[msg];
  for (let estado in aproveitamento) {
    if (msg.includes(estado)) return estado;
  }
  if (msg.includes("forca aerea") || msg.includes("força aérea") || msg.includes("fab")) return "força aérea";
  if (msg.includes("gcm") || msg.includes("paranagua") || msg.includes("paranaguá")) return "gcm paranaguá";
  if (msg.includes("rondonia") || msg.includes("rondônia")) return "rondônia";
  if (msg.includes("roraima")) return "roraima";
  if (msg.includes("piaui") || msg.includes("piauí")) return "piauí";
  return null;
}

async function enviarTexto(jid, texto) {
  await sock.sendMessage(jid, { text: texto });
}

async function enviarImagem(jid, url, caption) {
  try {
    const buffer = await baixarBuffer(url);
    await sock.sendMessage(jid, { image: buffer, caption });
    console.log(`✅ Imagem enviada`);
  } catch (e) {
    console.log(`❌ Erro imagem:`, e.message);
  }
}

async function enviarVideo(jid, url, caption) {
  try {
    console.log(`⬇️ Baixando vídeo...`);
    const buffer = await baixarBuffer(url);
    await sock.sendMessage(jid, { video: buffer, caption });
    console.log(`✅ Vídeo enviado`);
  } catch (e) {
    console.log(`❌ Erro vídeo:`, e.message);
  }
}

async function enviarAudio(jid, url) {
  try {
    const buffer = await baixarBuffer(url);
    await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true });
    console.log(`✅ Áudio enviado`);
  } catch (e) {
    console.log(`❌ Erro áudio:`, e.message);
  }
}

async function enviarPDF(jid, caminho, caption) {
  try {
    const buffer = fs.readFileSync(caminho);
    const nome = caminho.replace('./', '');
    await sock.sendMessage(jid, { document: buffer, mimetype: 'application/pdf', fileName: nome, caption });
    console.log(`✅ PDF enviado: ${nome}`);
  } catch (e) {
    console.log(`❌ Erro PDF:`, e.message);
  }
}

async function processarMensagem(jid, texto) {
  const msg = texto.toLowerCase().trim();
  console.log(`[${jid}] Mensagem: "${msg}" | Etapa: ${etapa[jid]}`);

  if (etapa[jid] === "finalizado") return;

  if (!etapa[jid]) {
    etapa[jid] = "estado";
    await enviarTexto(jid, `Falaaa Policial Militar 💀\n\nTudo na paz?\n\nVocê é de qual estado???`);
    return;
  }

  if (etapa[jid] === "estado") {
    const estadoDetectado = detectarEstado(msg);

    if (!estadoDetectado) {
      await enviarTexto(jid,
        "Não consegui identificar o estado 😅\n\n" +
        "Pode digitar o nome completo ou a sigla, por exemplo:\n" +
        "*São Paulo* ou *SP*\n" +
        "*Minas Gerais* ou *MG*\n" +
        "*Roraima* ou *RR*"
      );
      return;
    }

    etapa[jid] = "finalizado";
    const info = aproveitamento[estadoDetectado];

    await enviarTexto(jid,
      `Sensacional, Estado do *${estadoDetectado.toUpperCase()}* 🇧🇷\n\n` +
      `Aí sim, um dos Melhores Estados do Brasil 🇧🇷\n\n` +
      `Por aqui, 1º Sgt PM Kaleu, da Polícia Militar do Estado de São Paulo, atualmente eu trabalho na Escola Superior de Sargentos. Vou te encaminhar um vídeo explicativo do que é, e como é essa Diplomação em Gestão Pública realizada pela Faculdade FAUESP, com o aproveitamento da nossa Formação Policial.\n\n` +
      `Obs: Informo que Hoje a Faculdade FAUESP, está presente em 22 Estados, dos quais os Estados de SÃO PAULO e ALAGOAS, o referido aproveitamento escolar ocorre com 100%, NÃO sendo necessário o aluno Policial cursar mais NENHUMA disciplina e/ou Atividade.\n\n` +
      `• Policial Militar de outros Estados, por favor, Confira a Tabela de Aproveitamento de Estudo do seu Estado e veja quantas disciplinas, APENAS, vc deverá cursar, bem como o prazo mínimo para solicitar a conclusão!!!\n\n` +
      `Pra cimaaaaa 🚀🚀🚀`
    );

    await delay(2000);
    await enviarTexto(jid, `📚 *Aproveitamento da sua formação*\n\n${info}`);
    await delay(3000);

    await enviarVideo(jid, URLS.video1, "🎥 Assista esse vídeo explicativo");
    await delay(3000);

    await enviarVideo(jid, URLS.video2, "📌 Mais detalhes sobre a diplomação");
    await delay(3000);

    await enviarTexto(jid,
      `🚨🚨🚨\nAlém da Diplomação em Gestão Pública a FAUESP também oferece:\n\n• 15 Licenciaturas\n• Bacharel em Educação Física\n• 93 Pós-graduações`
    );
    await delay(3000);

    await enviarImagem(jid, URLS.licenciaturas, "📚 Licenciaturas disponíveis");
    await delay(3000);

    await enviarPDF(jid, PDF.pos, "📄 Opções de Pós-graduação");
    await delay(3000);

    await enviarPDF(jid, PDF.planos, "💰 Planos e valores\n\n🔥 *PLANOS EM PROMOÇÃO*\nPlanos 4 e 7 - estão em promoção até 31MAR26");
    await delay(2000);

    await enviarTexto(jid,
      `Matrícula 👇\n\nhttps://forms.zohopublic.com/FAUESP/form/RequerimentodeMatrculaAdministradorNovo/formperma/3C_4ORYAJv1zrhKuU7Q6pnyTtQQRuyI3jswnQ5JFobs?num=13`
    );
    await delay(3000);

    await enviarTexto(jid, `🎧 Escuta esse áudio rápido antes de entrar no grupo 👇`);
    await delay(2000);

    await enviarAudio(jid, URLS.audio);
    await delay(3000);

    await enviarTexto(jid,
      `👮‍♂️ Grupo exclusivo de policiais:\n\nhttps://chat.whatsapp.com/KesR0ns7tPx8EdDtz9I8rK?mode=gi_t`
    );
  }
}

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState('/app/.wwebjs_auth/baileys');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Bot FAUESP', 'Chrome', '1.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrAtual = qr;
      console.log('📱 QR gerado! Acesse /qr para escanear');
    }

    if (connection === 'open') {
      qrAtual = null;
      console.log('✅ Bot conectado!');
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true;

      console.log('⚠️ Conexão fechada. Reconectar:', shouldReconnect);
      if (shouldReconnect) {
        await delay(5000);
        conectar();
      } else {
        console.log('❌ Deslogado. Acesse /qr para reconectar.');
        // Limpa sessão para forçar novo QR
        try { fs.rmSync('/app/.wwebjs_auth/baileys', { recursive: true }); } catch(e) {}
        await delay(3000);
        conectar();
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (msg.key.fromMe) continue;
        if (msg.key.remoteJid.includes('@g.us')) continue;
        if (msg.key.remoteJid === 'status@broadcast') continue;

        const jid = msg.key.remoteJid;
        const texto = msg.message?.conversation
          || msg.message?.extendedTextMessage?.text
          || '';

        if (!texto) continue;

        await processarMensagem(jid, texto);
      } catch (e) {
        console.error('❌ Erro ao processar mensagem:', e.message);
      }
    }
  });
}

app.get('/qr', async (req, res) => {
  if (!qrAtual) {
    return res.send(`
      <h2>⏳ Aguardando QR...</h2>
      <p>O QR ainda não foi gerado ou o bot já está conectado.</p>
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

conectar();