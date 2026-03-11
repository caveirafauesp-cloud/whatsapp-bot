const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const https = require('https');
const http = require('http');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
let qrAtual = null;
let clientePronto = false;

const CLOUDINARY = {
  video1:        'https://res.cloudinary.com/dkouzu5ho/video/upload/v1773239831/video1_vx1msc.mp4',
  video2:        'https://res.cloudinary.com/dkouzu5ho/video/upload/v1773239831/video2_nyxew7.mp4',
  audio:         'https://res.cloudinary.com/dkouzu5ho/video/upload/v1773239830/audiok1_hh2sm6.ogg',
  licenciaturas: 'https://res.cloudinary.com/dkouzu5ho/image/upload/v1773239831/licenciaturas_zqtt5k.jpg'
};

const DESTINOS = {
  video1:        '/app/.wwebjs_auth/video1.mp4',
  video2:        '/app/.wwebjs_auth/video2.mp4',
  audio:         '/app/.wwebjs_auth/audiok1.ogg',
  licenciaturas: '/app/.wwebjs_auth/licenciaturas.jpg'
};

const PDF = {
  pos:    './posgraduacao.pdf',
  planos: './planos.pdf'
};

const arquivos = {};

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

function baixarArquivo(url, destino) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destino)) {
      console.log(`✅ Já existe: ${destino}`);
      return resolve();
    }
    console.log(`⬇️ Baixando: ${destino}`);
    const protocolo = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destino);
    protocolo.get(url, response => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destino);
        return baixarArquivo(response.headers.location, destino).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); console.log(`✅ Baixado: ${destino}`); resolve(); });
    }).on('error', err => { fs.unlink(destino, () => {}); reject(err); });
  });
}

async function carregarArquivos() {
  for (const [nome, url] of Object.entries(CLOUDINARY)) {
    try {
      await baixarArquivo(url, DESTINOS[nome]);
      arquivos[nome] = MessageMedia.fromFilePath(DESTINOS[nome]);
      console.log(`✅ Pronto: ${nome}`);
    } catch (e) {
      console.log(`❌ Erro ao carregar ${nome}:`, e.message);
    }
  }
  for (const [nome, caminho] of Object.entries(PDF)) {
    try {
      if (fs.existsSync(caminho)) {
        arquivos[nome] = MessageMedia.fromFilePath(caminho);
        console.log(`✅ PDF carregado: ${caminho}`);
      } else {
        console.log(`⚠️ PDF não encontrado: ${caminho}`);
      }
    } catch (e) {
      console.log(`❌ Erro PDF ${nome}:`, e.message);
    }
  }
}

async function enviarComRetry(contato, arquivo, opcoes, tentativas = 5) {
  for (let i = 0; i < tentativas; i++) {
    try {
      if (!clientePronto) {
        console.log('⏳ Aguardando cliente ficar pronto...');
        await delay(5000);
      }
      await client.sendMessage(contato, arquivo, opcoes);
      return true;
    } catch (e) {
      console.log(`⚠️ Tentativa ${i + 1} falhou:`, e.message);
      if (i < tentativas - 1) await delay(6000);
    }
  }
  console.log(`❌ Falhou após ${tentativas} tentativas`);
  return false;
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
  "al": "alagoas", "sp": "são paulo", "ba": "bahia", "ce": "ceará",
  "es": "espírito santo", "ma": "maranhão", "mt": "mato grosso",
  "ms": "mato grosso do sul", "mg": "minas gerais", "pa": "pará",
  "pb": "paraíba", "pr": "paraná", "pe": "pernambuco", "se": "sergipe",
  "rn": "rio grande do norte", "rs": "rio grande do sul", "to": "tocantins"
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
    await carregarArquivos();
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

      for (let estado in aproveitamento) {
        if (msg.includes(estado)) { estadoDetectado = estado; break; }
      }

      if (!estadoDetectado && siglas[msg]) {
        estadoDetectado = siglas[msg];
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

      if (arquivos.video1) await enviarComRetry(contato, arquivos.video1, { caption: "🎥 Assista esse vídeo explicativo" });
      await delay(6000);

      if (arquivos.video2) await enviarComRetry(contato, arquivos.video2, { caption: "📌 Mais detalhes sobre a diplomação" });
      await delay(4000);

      await client.sendMessage(contato,
        `🚨🚨🚨\nAlém da Diplomação em Gestão Pública a FAUESP também oferece:\n\n• 15 Licenciaturas\n• Bacharel em Educação Física\n• 93 Pós-graduações`
      );
      await delay(3000);

      if (arquivos.licenciaturas) await enviarComRetry(contato, arquivos.licenciaturas, { caption: "📚 Licenciaturas disponíveis" });
      await delay(3000);

      if (arquivos.pos) await enviarComRetry(contato, arquivos.pos, { caption: "📄 Opções de Pós-graduação" });
      await delay(3000);

      if (arquivos.planos) await enviarComRetry(contato, arquivos.planos, {
        caption: "💰 Planos e valores\n\n🔥 *PLANOS EM PROMOÇÃO*\nPlanos 4 e 7 - estão em promoção até 31MAR26"
      });
      await delay(2000);

      await client.sendMessage(contato,
        `Matrícula 👇\n\nhttps://forms.zohopublic.com/FAUESP/form/RequerimentodeMatrculaAdministradorNovo/formperma/3C_4ORYAJv1zrhKuU7Q6pnyTtQQRuyI3jswnQ5JFobs?num=13`
      );
      await delay(3000);

      await client.sendMessage(contato, `🎧 Escuta esse áudio rápido antes de entrar no grupo 👇`);
      await delay(2000);

      if (arquivos.audio) await enviarComRetry(contato, arquivos.audio, { sendAudioAsVoice: true });
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