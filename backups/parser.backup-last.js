const CLIENTES=["Seu Pedro","Henrique","Marcelo 1","Padaria BMG","Peixaria Ronald","Alex Rua 22","Peixaria Tiago","Peixaria Pará","Barraca Condomínio","Alex Campinho","Sou JOY","Marcão","Alex Baiano","Maria Helieide","Márcio","Caldo Inhoaíba","Marcelo 2","Alex Laranja","Chop Feira","Churrasco Cosmos","Luiz Peixaria","Padaria Paciência","Salão Piscina","Lilian","Café","Churrasco 1 L","Bruno","Chatuba","Tia","Churrasco 2 T","Angélica","Sr. Gilson","Peixaria Bacaxá","Custódio","Gelo 22","Cliente Rua","Jonny Feira"];
const SO_FILTRADO=new Set(["Marcelo 1","Marcelo 2","Tia","Sr. Gilson","Sou JOY","Café","Angélica"]);
const SO_ESCAMAS=new Set(["Padaria BMG","Alex Rua 22","Peixaria Ronald","Peixaria Tiago","Peixaria Pará","Alex Campinho","Marcão","Márcio","Alex Laranja","Chop Feira","Churrasco Cosmos","Luiz Peixaria","Padaria Paciência","Lilian","Churrasco 1 L","Bruno","Chatuba","Churrasco 2 T","Peixaria Bacaxá","Custódio","Gelo 22","Jonny Feira"]);
const ALIASES_FIXOS={"caldo de cana":"Marcelo 1","marcelo caldo de cana":"Marcelo 1","marcelo um":"Marcelo 1","marcelo 1":"Marcelo 1","marcelo cosmos":"Marcelo 2","marcelo cosmo":"Marcelo 2","marcelo dois":"Marcelo 2","marcelo 2":"Marcelo 2","bmg":"Padaria BMG","padaria bmg":"Padaria BMG","padaria paciencia":"Padaria Paciência","condominio":"Barraca Condomínio","barraca condominio":"Barraca Condomínio","cliente condominio":"Barraca Condomínio","rapaz do condominio":"Barraca Condomínio","moca do condominio":"Barraca Condomínio","caldo do condominio":"Barraca Condomínio","para":"Peixaria Pará","peixaria para":"Peixaria Pará","tiago":"Peixaria Tiago","peixaria tiago":"Peixaria Tiago","ronald":"Peixaria Ronald","peixaria ronald":"Peixaria Ronald","perninha":"Alex Rua 22","alex perninha":"Alex Rua 22","alex vinte e dois":"Alex Rua 22","alex rua 22":"Alex Rua 22","alex campinho":"Alex Campinho","conjunto campinho":"Alex Campinho","estrada do campinho":"Alex Campinho","sou joy":"Sou JOY","joy":"Sou JOY","joi":"Sou JOY","restaurante joy":"Sou JOY","restaurante joi":"Sou JOY","filomena":"Maria Helieide","maria leide":"Maria Helieide","maria eleide":"Maria Helieide","maria helieide":"Maria Helieide","helieide":"Maria Helieide","peixaria do gil":"Maria Helieide","filomena aqui no gil":"Maria Helieide","jorge":"Peixaria Bacaxá","seu jorge":"Peixaria Bacaxá","peixaria do jorge":"Peixaria Bacaxá","bacaxa":"Peixaria Bacaxá","abacaxi":"Peixaria Bacaxá","luiz":"Luiz Peixaria","seu luiz":"Luiz Peixaria","peixaria do luiz":"Luiz Peixaria","pedro":"Seu Pedro","seu pedro":"Seu Pedro","gilson":"Sr. Gilson","seu gilson":"Sr. Gilson","senhor gilson":"Sr. Gilson","rango mineiro":"Sr. Gilson","cafe":"Café","loja do cafe":"Café","barraca do cafe":"Café","cafeteria":"Café","angelica":"Angélica","barraca da angelica":"Angélica","aqui na angelica":"Angélica","barraca de caldo da angelica":"Angélica","barraca de caldo de cana da angelica":"Angélica","jonny":"Jonny Feira","joni":"Jonny Feira","jonne":"Jonny Feira","abelha":"Jonny Feira","maluco da feira":"Jonny Feira","cara da feira":"Jonny Feira","chop":"Chop Feira","chop feira":"Chop Feira","salao":"Salão Piscina","salao piscina":"Salão Piscina","piscina":"Salão Piscina","bruno":"Bruno","peixaria bruno":"Bruno","encanamento":"Bruno","peixaria encanamento":"Bruno","custodio":"Custódio","peixaria do custodio":"Custódio","escorinho":"Custódio","peixaria do escorinho":"Custódio","baiano":"Alex Baiano","baianinho":"Alex Baiano","aqui no baiano":"Alex Baiano","cliente rua":"Cliente Rua","gelo 22":"Gelo 22","rapaz do 22":"Gelo 22","caldo inhoaiba":"Caldo Inhoaíba","caldo em inhoaiba":"Caldo Inhoaíba","barraquinho em inhoaiba":"Caldo Inhoaíba","caldo do lado do marcio":"Caldo Inhoaíba","churrasco cosmos":"Churrasco Cosmos","churrasco cosmo":"Churrasco Cosmos","frango cosmo":"Churrasco Cosmos","churrasco l":"Churrasco 1 L","churrasco lilian":"Churrasco 1 L","churrasco t":"Churrasco 2 T","churrasco tia":"Churrasco 2 T","marcio":"Márcio","peixaria marcio":"Márcio","alex laranja":"Alex Laranja","marcao":"Marcão","padaria paciencia":"Padaria Paciência","lilian":"Lilian","peixaria lilian":"Lilian"};
const NUMEROS={um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,quatorze:14,catorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19,vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90,cem:100};
function norm(s=""){return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim()}
function aliases(config){const m=new Map(Object.entries(ALIASES_FIXOS).map(([a,c])=>[norm(a),c]));for(const c of CLIENTES)m.set(norm(c),c);for(const x of(config?.clientes||[])){if(!x?.nome)continue;m.set(norm(x.nome),x.nome);for(const a of(x.apelidos||[]))if(a)m.set(norm(a),x.nome)}for(const a of["alex","marcelo","churrasco","padaria","feira"])m.delete(a);return[...m.entries()].sort((a,b)=>b[0].length-a[0].length)}
function cliente(texto,config){const t=norm(texto);for(const[a,n]of aliases(config)){const re=new RegExp(`(?:^|\\s)${a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?:$|\\s)`);if(re.test(t))return{nome:n,alias:a}}return{nome:"",alias:""}}
function clientesMencionados(texto,config){const t=norm(texto),nomes=new Set();for(const[a,n]of aliases(config)){const re=new RegExp(`(?:^|\\s)${a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?:$|\\s)`);if(re.test(t))nomes.add(n)}return nomes}
function numeroEm(t,i){const x=t[i]||"";if(/^\d+$/.test(x))return{valor:+x,usados:1};const b=NUMEROS[x];if(b==null)return null;if(b>=20&&b<100&&t[i+1]==="e"){const u=NUMEROS[t[i+2]];if(u>=1&&u<=9)return{valor:b+u,usados:3}}return{valor:b,usados:1}}
function primeiroNumero(t){for(let i=0;i<t.length;i++){const n=numeroEm(t,i);if(n)return n.valor}return null}
function qtdPerto(t,p){for(let i=0;i<t.length;i++){if(!p.includes(t[i]))continue;for(let j=Math.max(0,i-5);j<i;j++){const n=numeroEm(t,j);if(!n)continue;const fim=j+n.usados;const entre=t.slice(fim,i).filter(Boolean);if(!entre.length||entre.every(x=>["saco","sacos","de","do","da"].includes(x)))return n.valor}}return null}
function qtdSacos(t){
  for(let i=0;i<t.length;i++){
    if(!["saco","sacos"].includes(t[i]))continue;
    for(let j=i-1;j>=Math.max(0,i-4);j--){
      const n=numeroEm(t,j);
      if(n&&j+n.usados===i&&n.valor>=1&&n.valor<=200)return n.valor;
    }
  }
  return null
}
function qtdPorAcao(t){
  const acoes=new Set(["deixei","deixou","deixaram","ficou","ficaram","entreguei","entregou","entregaram","botei","botou","coloquei","colocou","pegou","pegaram","levou","levaram","recebeu","receberam"]);
  for(let i=0;i<t.length;i++){
    if(!acoes.has(t[i]))continue;
    for(let j=i+1;j<=Math.min(t.length-1,i+5);j++){
      const n=numeroEm(t,j);
      if(n&&n.valor>=1&&n.valor<=200)return n.valor;
    }
  }
  return null
}
function somenteLinkOuSemVenda(texto){
  const raw=String(texto||"").trim();
  if(!raw)return true;
  const semLinks=raw.replace(/https?:\/\/\S+/gi," ").replace(/www\.\S+/gi," ").trim();
  if(!semLinks)return true;
  const t=norm(semLinks);
  if(!t)return true;
  const temVenda=/\b(deixei|deixou|deixaram|ficou|ficaram|entreguei|entregou|entregaram|botei|botou|coloquei|colocou|pegou|pegaram|levou|levaram|recebeu|receberam|saco|sacos|escama|escamas|filtrado|filtrados)\b/.test(t);
  return !temVenda&&/https?:\/\/|www\./i.test(raw)
}
function tipoCliente(nome,config){const x=(config?.clientes||[]).find(v=>v?.nome===nome);if(x?.tipo)return x.tipo;if(SO_FILTRADO.has(nome))return"filtrado";if(SO_ESCAMAS.has(nome))return"escamas";return"ambos"}
function pagamentoEm(t){if(/\bpix\b|\bfez pix\b|\bfazer o pix\b|\bvai fazer pix\b|\bvai fazer o pix\b|\bpagou no pix\b/.test(t))return"PIX";if(/\bfiado\b|\bpagar depois\b|\bpaga depois\b/.test(t))return"Fiado";if(/\bdinheiro\b|\bpago\b|\bpagou\b|\bem especie\b/.test(t))return"Dinheiro";return"Não informado"}
export function interpretarVenda(texto,config=null){if(somenteLinkOuSemVenda(texto))return{cliente:"",alias_detectado:"",escamas:0,filtrado:0,total_sacos:0,pagamento:"Não informado",status:"ignorar",texto_origem:String(texto||"").trim(),precisa_revisao:true,faltando:["mensagem sem contexto de venda"]};const t=norm(texto),c=cliente(texto,config);const semAlias=c.alias?t.replace(new RegExp(`(?:^|\\s)${c.alias.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?=$|\\s)`)," ").trim():t;const tokens=t.split(" ").filter(Boolean),qTokens=semAlias.split(" ").filter(Boolean),pf=["filtrado","filtrados","filtrada","filtradas","filtro"],pe=["escama","escamas","comum","comuns"],temF=tokens.some(x=>pf.includes(x)),temE=tokens.some(x=>pe.includes(x));const qtdF=temF?qtdPerto(qTokens,pf):null,qtdE=temE?qtdPerto(qTokens,pe):null;let filtrado=temF?(qtdF??0):0,escamas=temE?(qtdE??0):0;const tc=tipoCliente(c.nome,config),qSacos=qtdSacos(tokens),qAcao=qtdPorAcao(qTokens),qGeral=!temF&&!temE?(qSacos??qAcao??primeiroNumero(qTokens)):null;if(temF&&qtdF==null&&(qSacos??qAcao)!=null)filtrado=qSacos??qAcao;if(temE&&qtdE==null&&(qSacos??qAcao)!=null)escamas=qSacos??qAcao;if(!temF&&!temE){const q=qGeral??1;if(tc==="filtrado")filtrado=q;else if(tc==="escamas")escamas=q;else if(c.nome){/* cliente de ambos: não inventar produto */}}const pagamento=pagamentoEm(t),faltando=[];if(!c.nome)faltando.push("cliente");if(!(escamas+filtrado)){if(c.nome&&tc==="ambos")faltando.push("produto");else faltando.push("quantidade")}if((temF&&qtdF==null)||(temE&&qtdE==null)||(!temF&&!temE&&qGeral==null))faltando.push("quantidade explícita");if(pagamento==="Não informado")faltando.push("pagamento");if(clientesMencionados(texto,config).size>1)faltando.push("mais de um cliente");let numeros=0;for(let i=0;i<qTokens.length;i++){const n=numeroEm(qTokens,i);if(n){numeros++;i+=n.usados-1}}if((escamas+filtrado)>200){escamas=0;filtrado=0;faltando.push("quantidade fora do limite")}return{cliente:c.nome,alias_detectado:c.alias,escamas,filtrado,total_sacos:escamas+filtrado,pagamento,status:"pendente_revisao",texto_origem:String(texto||"").trim(),precisa_revisao:faltando.length>0,faltando}}

function ocorrenciasClientes(texto,config){
  const t=norm(texto),achados=[];
  for(const [a,n] of aliases(config)){
    let pos=0;
    while(pos<t.length){
      const i=t.indexOf(a,pos);
      if(i<0)break;
      const antes=i===0?' ':t[i-1],depois=i+a.length>=t.length?' ':t[i+a.length];
      if(antes===' '&&depois===' ')achados.push({nome:n,alias:a,ini:i,fim:i+a.length});
      pos=i+Math.max(1,a.length);
    }
  }
  achados.sort((x,y)=>x.ini-y.ini||(y.alias.length-x.alias.length));
  const limpos=[];
  for(const x of achados){
    const ultimo=limpos[limpos.length-1];
    if(ultimo&&x.ini<ultimo.fim)continue;
    if(ultimo&&x.nome===ultimo.nome&&x.ini<=ultimo.fim+3)continue;
    limpos.push(x);
  }
  return limpos;
}

export function interpretarVendas(texto,config=null){
  const original=String(texto||'').trim(),t=norm(original);
  const ocorrencias=ocorrenciasClientes(original,config);
  const nomes=[...new Set(ocorrencias.map(x=>x.nome))];
  if(nomes.length<=1)return [interpretarVenda(original,config)];
  const vendas=[];
  for(let i=0;i<ocorrencias.length;i++){
    const atual=ocorrencias[i];
    if(i>0&&ocorrencias[i-1].nome===atual.nome)continue;
    const proxima=ocorrencias[i+1];
    const inicio=Math.max(0,atual.ini-24);
    const fim=proxima?proxima.ini:t.length;
    const trecho=t.slice(inicio,fim).trim();
    const v=interpretarVenda(trecho,config);
    v.cliente=atual.nome;v.alias_detectado=atual.alias;v.texto_origem=trecho;
    const tc=tipoCliente(atual.nome,config);
    if(v.total_sacos===0){
      const tokens=trecho.split(' ').filter(Boolean);
      const q=qtdSacos(tokens)??qtdPorAcao(tokens)??primeiroNumero(tokens);
      if(Number.isInteger(q)&&q>0&&q<=200){
        if(tc==='filtrado'){v.filtrado=q;v.escamas=0}
        else if(tc==='escamas'){v.escamas=q;v.filtrado=0}
        v.total_sacos=v.escamas+v.filtrado;
      }
    }
    v.faltando=(v.faltando||[]).filter(x=>x!=='cliente'&&!(x==='quantidade'&&v.total_sacos>0)&&!(x==='quantidade explícita'&&v.total_sacos>0));
    v.precisa_revisao=v.faltando.length>0;
    vendas.push(v);
  }
  return vendas.length?vendas:[interpretarVenda(original,config)];
}
