const CLIENTES = [
  "Seu Pedro","Henrique","Marcelo 1","Padaria BMG","Peixaria Ronald","Alex Rua 22","Peixaria Tiago","Peixaria Pará","Barraca Condomínio","Alex Campinho","Marcão","Alex Baiano","Maria Helieide","Márcio","Caldo Inhoaíba","Marcelo 2","Alex Laranja","Chop Feira","Churrasco Cosmos","Luiz Peixaria","Padaria Paciência","Salão Piscina","Lilian","Churrasco 1 L","Bruno","Chatuba","Tia","Churrasco 2 T","Sr. Gilson","Peixaria Bacaxá","Custódio","Gelo 22","Cliente Rua","Jonny Feira"
];

const ALIASES_FIXOS = {
  "caldo de cana":"Marcelo 1","marcelo caldo de cana":"Marcelo 1","marcelo um":"Marcelo 1","marcelo 1":"Marcelo 1",
  "marcelo cosmos":"Marcelo 2","marcelo dois":"Marcelo 2","marcelo 2":"Marcelo 2",
  "padaria":"Padaria BMG","bmg":"Padaria BMG","padaria bmg":"Padaria BMG",
  "padaria paciencia":"Padaria Paciência","padaria de paciencia":"Padaria Paciência",
  "condominio":"Barraca Condomínio","barraca condominio":"Barraca Condomínio","barraca do condominio":"Barraca Condomínio",
  "para":"Peixaria Pará","seu para":"Peixaria Pará","sr para":"Peixaria Pará","senhor para":"Peixaria Pará","peixaria para":"Peixaria Pará","peixaria do para":"Peixaria Pará",
  "tiago":"Peixaria Tiago","seu tiago":"Peixaria Tiago","sr tiago":"Peixaria Tiago","senhor tiago":"Peixaria Tiago","peixaria tiago":"Peixaria Tiago","peixaria do tiago":"Peixaria Tiago",
  "ronald":"Peixaria Ronald","seu ronald":"Peixaria Ronald","sr ronald":"Peixaria Ronald","senhor ronald":"Peixaria Ronald","peixaria ronald":"Peixaria Ronald","peixaria do ronald":"Peixaria Ronald",
  "perninha":"Alex Rua 22","alex perninha":"Alex Rua 22","seu perninha":"Alex Rua 22","sr perninha":"Alex Rua 22","senhor perninha":"Alex Rua 22","alex vinte e dois":"Alex Rua 22","alex rua vinte e dois":"Alex Rua 22","alex rua 22":"Alex Rua 22",
  "alex campinho":"Alex Campinho","peixaria alex campinho":"Alex Campinho","peixaria do alex campinho":"Alex Campinho","seu alex campinho":"Alex Campinho","sr alex campinho":"Alex Campinho","senhor alex campinho":"Alex Campinho",
  "filomena":"Maria Helieide","peixaria filomena":"Maria Helieide","peixaria da filomena":"Maria Helieide","maria filomena":"Maria Helieide","maria helieide":"Maria Helieide","helieide":"Maria Helieide",
  "jorge":"Peixaria Bacaxá","seu jorge":"Peixaria Bacaxá","sr jorge":"Peixaria Bacaxá","senhor jorge":"Peixaria Bacaxá","peixaria jorge":"Peixaria Bacaxá","peixaria do jorge":"Peixaria Bacaxá","peixaria bacaxa":"Peixaria Bacaxá","bacaxa":"Peixaria Bacaxá","bacacha":"Peixaria Bacaxá","peixaria bacacha":"Peixaria Bacaxá",
  "luiz":"Luiz Peixaria","seu luiz":"Luiz Peixaria","sr luiz":"Luiz Peixaria","senhor luiz":"Luiz Peixaria","luiz peixaria":"Luiz Peixaria","peixaria luiz":"Luiz Peixaria","peixaria do luiz":"Luiz Peixaria",
  "pedro":"Seu Pedro","seu pedro":"Seu Pedro","sr pedro":"Seu Pedro","senhor pedro":"Seu Pedro",
  "gilson":"Sr. Gilson","seu gilson":"Sr. Gilson","sr gilson":"Sr. Gilson","senhor gilson":"Sr. Gilson",
  "jonny":"Jonny Feira","joni":"Jonny Feira","jonny feira":"Jonny Feira","joni feira":"Jonny Feira",
  "chop":"Chop Feira","chop feira":"Chop Feira",
  "salao":"Salão Piscina","salao piscina":"Salão Piscina","piscina":"Salão Piscina",
  "cliente da rua":"Cliente Rua","cliente rua":"Cliente Rua","rua":"Cliente Rua",
  "gelo vinte e dois":"Gelo 22","gelo 22":"Gelo 22",
  "caldo inhoaiba":"Caldo Inhoaíba","inhoaiba":"Caldo Inhoaíba",
  "churrasco cosmos":"Churrasco Cosmos"
};

const NUMEROS = {
  um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,
  onze:11,doze:12,treze:13,quatorze:14,catorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19,
  vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90,cem:100
};

function norm(text="") {
  return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
}

function criarAliases(){
  const m = new Map();
  for (const [a,c] of Object.entries(ALIASES_FIXOS)) m.set(norm(a),c);
  for (const c of CLIENTES) {
    const n = norm(c); m.set(n,c);
    const semTitulo = n.replace(/^(seu|sr|senhor)\s+/,"");
    if (semTitulo !== n) { m.set(semTitulo,c); m.set("seu "+semTitulo,c); m.set("sr "+semTitulo,c); m.set("senhor "+semTitulo,c); }
    if (n.startsWith("peixaria ")) {
      const b=n.replace(/^peixaria\s+/,""); m.set(b,c); m.set("seu "+b,c); m.set("sr "+b,c); m.set("senhor "+b,c); m.set("peixaria do "+b,c);
    }
    if (n.endsWith(" peixaria")) {
      const b=n.replace(/\s+peixaria$/,""); m.set(b,c); m.set("seu "+b,c); m.set("sr "+b,c); m.set("senhor "+b,c); m.set("peixaria "+b,c); m.set("peixaria do "+b,c);
    }
  }
  for (const amb of ["alex","marcelo","churrasco"]) m.delete(amb);
  return [...m.entries()].sort((a,b)=>b[0].length-a[0].length);
}

const ALIASES = criarAliases();

function cliente(texto){
  const t=norm(texto);
  for(const [alias,nome] of ALIASES){
    const re=new RegExp(`(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?:$|\\s)`);
    if(re.test(t)) return {nome,alias};
  }
  return {nome:"",alias:""};
}

function numeroEm(tokens,i){
  const token=tokens[i]||"";
  if(/^\d+$/.test(token)) return {valor:Number(token),usados:1};
  const base=NUMEROS[token];
  if(base==null) return null;
  if(base>=20 && base<100 && tokens[i+1]==="e"){
    const unidade=NUMEROS[tokens[i+2]];
    if(unidade>=1 && unidade<=9) return {valor:base+unidade,usados:3};
  }
  return {valor:base,usados:1};
}
function primeiroNumero(tokens){
  for(let i=0;i<tokens.length;i++){const n=numeroEm(tokens,i);if(n)return n.valor;}
  return null;
}
function qtdPerto(tokens,produtos){
  for(let i=0;i<tokens.length;i++){
    if(!produtos.includes(tokens[i])) continue;
    for(let j=Math.max(0,i-4);j<i;j++){
      const n=numeroEm(tokens,j); if(n && j+n.usados===i) return n.valor;
    }
  }
  return null;
}

export function interpretarVenda(texto){
  const t=norm(texto),tokens=t.split(" ").filter(Boolean),c=cliente(texto);
  const pf=["filtrado","filtrados","filtrada","filtradas"],pe=["escama","escamas","comum","comuns"];
  const temF=tokens.some(x=>pf.includes(x)),temE=tokens.some(x=>pe.includes(x));
  let filtrado=temF?(qtdPerto(tokens,pf)??1):0,escamas=temE?(qtdPerto(tokens,pe)??1):0;
  if(!temF&&!temE){const q=primeiroNumero(tokens);escamas=q??1;}
  let pagamento="Não informado"; if(/\bfiado\b/.test(t)) pagamento="Fiado"; else if(/\bpix\b/.test(t)) pagamento="PIX"; else if(/\bdinheiro\b/.test(t)||/\bpago\b/.test(t)) pagamento="Dinheiro";
  const faltando=[]; if(!c.nome) faltando.push("cliente"); if(!(escamas+filtrado)) faltando.push("quantidade");
  return {cliente:c.nome,alias_detectado:c.alias,escamas,filtrado,total_sacos:escamas+filtrado,pagamento,status:"pendente_revisao",texto_origem:String(texto||"").trim(),precisa_revisao:faltando.length>0,faltando};
}
