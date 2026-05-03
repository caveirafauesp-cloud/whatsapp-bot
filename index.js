const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const https = require('https');
const http = require('http');
const express = require('express');
const QRCode = require('qrcode');
const PALAVRAS_RESET = ["kaleu_caveira"];
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
const mensagensProcessadas = new Set();
let usuariosFinalizados = new Set();
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
    await sock.sendMessage(jid, {
      image: { url },
      caption
    });
    console.log("✅ Imagem enviada");
  } catch (e) {
    console.log("❌ Erro imagem:", e.message);
  }
}

async function enviarVideo(jid, url, caption) {
  try {
    await sock.sendMessage(jid, {
      video: { url },
      caption
    });
    console.log("✅ Vídeo enviado");
  } catch (e) {
    console.log("❌ Erro vídeo:", e.message);
  }
}

async function enviarAudio(jid, url) {
  try {
    await sock.sendMessage(jid, {
      audio: { url },
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true
    });
    console.log("✅ Áudio enviado");
  } catch (e) {
    console.log("❌ Erro áudio:", e.message);
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

  // 🔄 RESET (ANTES DE TUDO)
  if (PALAVRAS_RESET.some(p => msg.includes(p))) {
    delete etapa[jid];
    usuariosFinalizados.delete(jid);

    await enviarTexto(jid,
      `🔄 Atendimento reiniciado!\n\nMe diz aí 👇\n\nVocê é de qual estado? 🇧🇷`
    );

    return;
  }

  // 🚫 BLOQUEIO
if (usuariosFinalizados.has(jid)) return;
  // 🟢 PRIMEIRA INTERAÇÃO (mantém sua frase original)
  if (!etapa[jid]) {
    etapa[jid] = "estado";

    await enviarTexto(jid,
      `Falaaa Policial Militar 💀\n\nTudo na paz?\n\nVocê é de qual estado???`
    );

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

       await enviarPDF(jid, PDF.pos, "📄 Opções de Pós-graduação");
    await delay(3000);

await enviarTexto(jid, `🚨🚨🚨
*FAUESP 2026*

*PLANOS DISPONÍVEIS*

🚨🚨🚨
-*Plano 1:* Gestão Pública + Pós Graduação

*Matrícula: R$350,00*
- 12x R$339,00 - no Cartão
- 18x R$250,00 - no Cartão
- 24x R$ 200,00 - no Cartão

ou
- 12x R$389,00 - no Boleto

🚨🚨🚨
-*Plano 2:* Somente Diplomação em Gestão Pública

*Matrícula: R$350,00*
- 12x R$299,00 - no Cartão
- 18x R$220,00 - no Cartão
- 24x R$ 176,00 - no Cartão

ou
- 06x R$698,00 - no Boleto

🚨🚨🚨
-*Plano 3:* Diplomação em Gestão Pública + Licenciatura R/4

*Matrícula: R$350,00*
- 12x R$399,00 - no Cartão
- 18x R$295,00 - no Cartão
- 24x R$ 235,00 - no Cartão

ou
- 12x R$ 449,00 - no Boleto

🚨🚨🚨
-*Plano 4:* Diplomação em Gestão Pública + Licenciatura R/4 + Pós-Graduação

*Matrícula: R$350,00*
- 12x R$449,00 - no Cartão
- 18x R$ 330,00 - no Cartão
- 24x R$ 265,00 - no Cartão

ou
- 12x R$499,00 - no Boleto

🚨🚨🚨
-*Plano 5:* Licenciatura R/4
*Obs:* Disponível somente para quem já possui graduação

*Matrícula: R$350,00*
- 12x R$249,00 - no Cartão
- 18x R$185,00 - no Cartão
- 24x R$ 148,00 - no Cartão

ou
- 12x R$299,00 - no Boleto

🚨🚨🚨
-*Plano 6:* 03 Pós-graduações + 03 Cursos de extensão

*Matrícula: R$350,00*
- 12x R$199,00 - no Cartão
- 18x R$148,00 - no Cartão
- 24x R$ 117,00 - no Cartão

ou
- 12x R$249,00 - no Boleto

🚨🚨🚨
-*Plano 7:* Plano Especial Mike

*Matrícula: R$350,00*
- 12x R$599,00 - no Cartão
- 18x R$440,00 - no Cartão
- 24x R$ 352,00 - no Cartão

ou
- 12x R$649,00 - no Boleto

🚨🚨🚨
-*Plano 8:* Licenciatura R/4 + Pós-Graduação

*Matrícula: de R$350,00*
- 12x R$299,00 - no Cartão
- 18x R$220,00 - no Cartão
- 24x R$ 177,00 - no Cartão

ou
- 12x R$349,00 - no Boleto

🚨🚨🚨
-*Plano 9:* 03 Cursos de Extensão

*Matrícula: R$49,00*
- 12x R$49,00 - no Cartão
ou
- 12x R$69,00 - no Boleto
`);
 await enviarImagem(jid, URLS.licenciaturas, "📚 Licenciaturas disponíveis");
    await delay(3000);

    await enviarTexto(jid, `🚨🚨🚨🚨
*Planos que Contemplam a Formação em Educação Física (Licenciatura e Bacharel)*
👇🏻👇🏻👇🏻👇🏻👇🏻

🚨🚨🚨
*Plano B1*
- BACHAREL EM EDUCAÇÃO FÍSICA

*Obs:* Em 12 meses, 100% online - SOMENTE aos Alunos (Policiais) que JA POSSUEM as Graduações de Gestão Pública + Licenciatura em Educação Fisica

*Matrícula: R$350,00*
- 12x R$399,00 - no Cartão
- 18x R$295,00 - no Cartão
- 24x R$ 235,00 - no Cartão

ou
- 12x R$449,00 - no Boleto

🚨🚨🚨
*Plano B2* - Especial Mike
- GESTÃO PÚBLICA (Diplomação);
- LICENCIATURA R/4 ED. FÍSICA;
- BACHAREL EM EDUCAÇÃO FÍSICA.

*Matrícula: R$350,00*
- 12x R$649,00 - no Cartão
- 18x R$479,00 - no Cartão
- 24x R$ 382,00 - no Cartão

ou
- 12x R$699,00 - no Boleto

🚨🚨🚨
*Plano B3*
- GESTÃO PÚBLICA (Diplomação);
- LICENCIATURA R/4 ED. FÍSICA;
- BACHAREL EM EDUCAÇÃO FÍSICA;
- (+) 01 LICENCIATURA (a sua escolha, dentro das disponíveis).

*Matrícula: R$350,00*
- 12x R$749,00 - no Cartão
- 18x R$555,00 - no Cartão
- 24x R$ 443,00 - no Cartão

ou
- 12x R$799,00 - no Boleto

🚨🚨🚨
*Plano B4*
- GESTÃO PÚBLICA (Diplomação);
- LICENCIATURA R/4 ED. FÍSICA;
- BACHAREL EM EDUCAÇÃO FÍSICA;
- (+) 01 LICENCIATURA (a sua escolha, dentro das disponíveis);
- ⁠03 Pós-graduações.

*Matrícula: R$350,00*
- 12x R$899,00 - no Cartão
- 18x R$667,00 - no Cartão
- 24x R$ 533,00 - no Cartão

ou
- 12x R$949,00 - no Boleto

🚨🚨🚨
*Plano B5*
- LICENCIATURA R/4 ED. FÍSICA;
- BACHAREL EM EDUCAÇÃO FÍSICA;

*Matrícula: R$350,00*
- 12x R$499,00 - no Cartão
- 18x R$370,00 - no Cartão
- 24x R$ 295,00 - no Cartão

ou
- 12x R$549,00`);
    await enviarTexto(jid,
      `Matrícula 👇\n\nhttps://www.fauespmilitar.com.br/requerimento_fauesp.html?consultor=Gustavo%20Passinato`
    );
    await delay(3000);

    await enviarTexto(jid, `🎧 Escuta esse áudio rápido antes de entrar no grupo 👇`);
    await delay(2000);

    await enviarAudio(jid, URLS.audio);
    await delay(3000);

    await enviarTexto(jid,
      `👮‍♂️ Grupo exclusivo de policiais:\n\nhttps://chat.whatsapp.com/KesR0ns7tPx8EdDtz9I8rK?mode=gi_t`
    );
    // 👇 FINAL DO FLUXO
usuariosFinalizados.add(jid);
etapa[jid] = "finalizado";
  }
}
function extrairTexto(msg) {
  const m = msg.message;
  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.buttonsResponseMessage?.selectedButtonId ||
    m?.listResponseMessage?.title ||
    m?.templateButtonReplyMessage?.selectedId ||
    ""
  );
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
      if (!msg.message) continue;
        
    if (mensagensProcessadas.has(msg.key.id)) continue;

mensagensProcessadas.add(msg.key.id);

    if (mensagensProcessadas.size > 5000) {
  mensagensProcessadas.clear();
}
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid.includes('@g.us')) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;

      const jid = msg.key.remoteJid;
      const texto = extrairTexto(msg);

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
app.get('/logout', async (req, res) => {
  try {
    await sock.logout();
    fs.rmSync('/app/.wwebjs_auth/baileys', { recursive: true, force: true });

    res.send("✅ WhatsApp desconectado com sucesso.");
    console.log("⚠️ WhatsApp desconectado manualmente");

  } catch (e) {
    res.send("Erro ao desconectar: " + e.message);
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Servidor rodando na porta ${PORT}`));

conectar();