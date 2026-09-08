const ALIASES = [
  ["marcelo caldo de cana", "Marcelo 1"], ["caldo de cana", "Marcelo 1"],
  ["marcelo 1", "Marcelo 1"], ["marcelo 2", "Marcelo 2"], ["marcelo cosmos", "Marcelo 2"],
  ["barraca condominio", "Barraca Condomínio"], ["condominio", "Barraca Condomínio"],
  ["padaria paciencia", "Padaria Paciência"], ["padaria bmg", "Padaria BMG"], ["padaria", "Padaria BMG"],
  ["peixaria tiago", "Tiago"], ["tiago", "Tiago"], ["peixaria para", "Pará"],
  ["sr gilson", "Seu Gilson"], ["seu gilson", "Seu Gilson"], ["gilson", "Seu Gilson"],
  ["chop feira", "Chop Feira"]
];

const NUMEROS = { um:1, uma:1, dois:2, duas:2, tres:3, quatro:4, cinco:5, seis:6, sete:7, oito:8, nove:9, dez:10, onze:11, doze:12, treze:13, quatorze:14, catorze:14, quinze:15, dezesseis:16, dezessete:17, dezoito:18, dezenove:19, vinte:20 };

function norm(text = "") {
  return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function numero(token) {
  if (/^\d+$/.test(token || "")) return Number(token);
  return NUMEROS[token] ?? null;
}

function cliente(texto) {
  const t = norm(texto);
  for (const [alias, nome] of [...ALIASES].sort((a,b) => b[0].length - a[0].length)) {
    if (t.includes(alias)) return { nome, alias };
  }
  return { nome:"", alias:"" };
}

function qtdPerto(tokens, produtos) {
  for (let i=0; i<tokens.length; i++) {
    if (!produtos.includes(tokens[i])) continue;
    for (let j=Math.max(0,i-3); j<i; j++) {
      const q = numero(tokens[j]);
      if (q !== null) return q;
    }
  }
  return null;
}

export function interpretarVenda(texto) {
  const t = norm(texto);
  const tokens = t.split(" ").filter(Boolean);
  const c = cliente(texto);
  const pf = ["filtrado","filtrados","filtrada","filtradas"];
  const pe = ["escama","escamas","comum","comuns"];
  const temF = tokens.some(x => pf.includes(x));
  const temE = tokens.some(x => pe.includes(x));
  let filtrado = temF ? (qtdPerto(tokens,pf) ?? 1) : 0;
  let escamas = temE ? (qtdPerto(tokens,pe) ?? 1) : 0;
  if (!temF && !temE) {
    const q = tokens.map(numero).find(x => x !== null);
    escamas = q ?? 1;
  }
  let pagamento = "Não informado";
  if (/\bpix\b/.test(t)) pagamento = "PIX";
  else if (/\bfiado\b/.test(t)) pagamento = "Fiado";
  else if (/\bdinheiro\b/.test(t) || /\bpago\b/.test(t)) pagamento = "Dinheiro";
  const faltando = [];
  if (!c.nome) faltando.push("cliente");
  if (!(escamas + filtrado)) faltando.push("quantidade");
  return { cliente:c.nome, alias_detectado:c.alias, escamas, filtrado, total_sacos:escamas+filtrado, pagamento, status:"pendente_revisao", texto_origem:String(texto||"").trim(), precisa_revisao:faltando.length>0, faltando };
}
