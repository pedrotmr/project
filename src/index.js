import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fetch from "node-fetch";
import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;

dotenv.config();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Configuração otimizada do WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "bot-financeiro",
  }),
  puppeteer: {
    headless: false,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  },
});

// Melhorar feedback visual
client.on("qr", (qr) => {
  console.log(
    "QR Code gerado! Você pode escanear tanto pelo Chrome quanto pelo terminal:"
  );
  qrcode.generate(qr, { small: true });
});

client.on("loading_screen", (percent, message) => {
  console.log("CARREGANDO:", percent, message);
});

client.on("authenticated", () => {
  console.log("AUTENTICADO! Bot está conectado ao WhatsApp.");
});

client.on("auth_failure", (msg) => {
  console.error("Falha na autenticação:", msg);
});

client.on("disconnected", (reason) => {
  console.log("Client was disconnected", reason);
});

// Process messages
client.on("message", async (message) => {
  console.log("Mensagem recebida:", message.body);

  // Teste simples - responde a qualquer mensagem começando com !
  if (message.body.startsWith("!")) {
    try {
      if (message.body === "!teste") {
        await message.reply("Bot funcionando! 👍");
      } else if (message.body.startsWith("!gastei")) {
        await message.reply("Registrando seu gasto...");
        // Aqui implementaremos a lógica de gastos depois
      } else if (message.body.startsWith("!recebi")) {
        await message.reply("Registrando sua receita...");
        // Aqui implementaremos a lógica de receitas depois
      }
    } catch (error) {
      console.error("Erro ao responder:", error);
      await message.reply("Desculpe, tive um erro ao processar sua mensagem.");
    }
  }
});

// Adicionar log para mensagens enviadas
client.on("message_create", (message) => {
  console.log("Mensagem enviada:", message.body);
});

// Função para fazer requisição ao Ollama (rodando localmente)
async function askOllama(prompt) {
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral",
        prompt: prompt,
        stream: false,
      }),
    });

    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error("Erro ao chamar Ollama:", error);
    throw error;
  }
}

async function isExpenseMessage(text) {
  // Padrão: número seguido de palavras
  const numberPattern = /^\d+(\.\d+)?\s/;
  return numberPattern.test(text);
}

// Definir emojis e mensagens amigáveis globalmente
const categoryEmojis = {
  Alimentação: "🍔",
  Transporte: "🚗",
  Moradia: "🏠",
  Lazer: "🎮",
  Saúde: "💊",
  Educação: "📚",
  Outros: "📝",
};

const friendlyMessages = {
  Alimentação: "Hummmm, parece que estava gostoso! 😋",
  Transporte: "Tá abastecido e pronto para novas aventuras! 🚗💨",
  Saúde: "Saúde em primeiro lugar! 💪",
  Lazer: "Diversão é importante! 🎉",
  Moradia: "Investindo no seu conforto! 🏠✨",
  Educação: "Conhecimento é um investimento! 📚",
  Outros: "Registro realizado com sucesso! ✅",
};

// Atualizar processExpense para garantir que salve no Supabase
async function processExpense(message) {
  const text = message.body;
  try {
    const prompt = `
        Você é um assistente que SEMPRE responde em JSON válido.
        Analise este gasto: "${text}"
        
        REGRAS:
        1. SEMPRE retorne apenas JSON válido, nada mais
        2. Use EXATAMENTE este formato:
        {
            "valor": [número extraído do texto],
            "categoria": [uma das opções: Alimentação, Transporte, Moradia, Lazer, Saúde, Educação, Outros],
            "descricao": [descrição do gasto]
        }`;

    const ollamaResponse = await askOllama(prompt);
    console.log("Resposta Ollama:", ollamaResponse);

    let jsonMatch = ollamaResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Resposta não contém JSON válido");
    }

    const cleanResponse = jsonMatch[0].trim();
    const parsedResponse = JSON.parse(cleanResponse);

    // Salvar no Supabase
    const { data, error } = await supabase.from("expenses").insert([
      {
        description: parsedResponse.descricao,
        amount: parsedResponse.valor,
        category: parsedResponse.categoria,
        date: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error("Erro ao salvar no Supabase:", error);
      throw error;
    }

    // Enviar apenas o registro detalhado
    const registroMessage =
      `📝 Registro de Transação Concluído\n` +
      `📄 Descrição: ${parsedResponse.descricao}\n` +
      `💰 Valor: R$ ${parsedResponse.valor}\n` +
      `📊 Tipo: Despesa\n` +
      `✏️ Categoria: ${parsedResponse.categoria}\n` +
      `📅 Data: ${new Date().toLocaleDateString("pt-BR")}\n` +
      `💳 Pago: ✅`;

    await message.reply(registroMessage);

    return parsedResponse;
  } catch (error) {
    console.error("Erro ao processar gasto:", error);
    await message.reply(
      'Desculpe, não consegui entender o gasto. Por favor, tente novamente com o formato "valor local" (exemplo: "50 farmacia")'
    );
    throw error;
  }
}

// Função para gerar relatório mensal
async function generateMonthlyReport() {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    console.log("Buscando gastos desde:", startOfMonth.toISOString()); // Debug

    const { data: expenses, error } = await supabase
      .from("expenses")
      .select("*")
      .gte("date", startOfMonth.toISOString())
      .order("category");

    if (error) {
      console.error("Erro ao buscar gastos:", error);
      throw error;
    }

    console.log("Gastos encontrados:", expenses); // Debug

    if (!expenses || expenses.length === 0) {
      return "Não encontrei nenhum gasto registrado neste mês.";
    }

    // Resto do código do relatório permanece igual
    const categoryTotals = expenses.reduce((acc, expense) => {
      if (!acc[expense.category]) {
        acc[expense.category] = {
          total: 0,
          items: [],
        };
      }
      acc[expense.category].total += expense.amount;
      acc[expense.category].items.push(expense);
      return acc;
    }, {});

    const totalGeral = expenses.reduce(
      (sum, expense) => sum + expense.amount,
      0
    );

    let report = `📊 *Relatório de Gastos do Mês*\n\n`;

    for (const [category, data] of Object.entries(categoryTotals)) {
      const emoji = categoryEmojis[category] || "📝";
      report += `${emoji} *${category}*: R$ ${data.total.toFixed(2)}\n`;

      data.items.forEach((item) => {
        report += `  • ${item.description}: R$ ${item.amount.toFixed(2)}\n`;
      });
      report += "\n";
    }

    report += `\n💰 *Total Geral: R$ ${totalGeral.toFixed(2)}*`;

    return report;
  } catch (error) {
    console.error("Erro ao gerar relatório:", error);
    throw error;
  }
}

// Atualizar o processamento de mensagens
client.on("message_create", async (message) => {
  // Ignorar TODAS as mensagens do bot
  if (message.fromMe) {
    return;
  }

  const text = message.body.trim().toLowerCase();

  try {
    // Comandos de relatório
    if (
      text.includes("gastos do mês") ||
      text.includes("relatório") ||
      text.includes("relatorio") ||
      text === "gastos"
    ) {
      console.log("Gerando relatório mensal...");
      const report = await generateMonthlyReport();
      await message.reply(report);
      return;
    }

    // Processamento de gastos
    if (await isExpenseMessage(text)) {
      console.log("Processando possível gasto:", text);
      await processExpense(message);
    }
  } catch (error) {
    console.error("Erro:", error);
    await message.reply("Desculpe, tive um erro ao processar sua solicitação.");
  }
});

// Melhor tratamento de reconexão
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

client.on("disconnected", async (reason) => {
  console.log("Desconectado:", reason);
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    console.log(
      `Tentativa de reconexão ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`
    );
    setTimeout(() => {
      client.initialize();
    }, 5000 * reconnectAttempts);
  }
});

client.initialize();
