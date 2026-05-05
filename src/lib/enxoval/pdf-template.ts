import { fmtBRL, KITS } from "./calc";
import type { EnxovalSnapshot } from "./derive";

const ESC: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
const escapeHtml = (s: string | number | null | undefined): string => {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
};

const HOUSE_SVG = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
  <polygon points="20,90 100,30 180,90" fill="#C73E2E" />
  <rect x="35" y="90" width="130" height="90" fill="#3F88C5" />
  <rect x="85" y="120" width="30" height="60" fill="#FFFFFF" />
  <rect x="50" y="105" width="22" height="22" fill="#FFFFFF" />
  <rect x="128" y="105" width="22" height="22" fill="#FFFFFF" />
  <rect x="20" y="180" width="160" height="6" fill="#3F88C5" />
</svg>
`.trim();

const ROW_LABELS_KITS = KITS.map((k) => k.label.trim());

function todayBR(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
}

const STYLE = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Helvetica', Arial, sans-serif; color: #333; }
  .top-bar { height: 8px; background: #3F88C5; }
  .ident-block { display: flex; align-items: stretch; }
  .ident-house { width: 110px; background: #ffffff; padding: 12px 10px; display: flex; align-items: center; justify-content: center; }
  .ident-house svg { width: 100%; height: auto; max-height: 110px; }
  .ident-table { flex: 1; border-collapse: collapse; }
  .ident-table th, .ident-table td { border: 1px solid #d4dbe4; padding: 3px 10px; font-size: 9pt; text-align: center; }
  .ident-table th { background: #c8d4e3; color: #2c3e50; font-weight: 700; width: 32%; text-align: left; padding-left: 14px; }
  .ident-table td { color: #c73e2e; font-weight: 500; }
  .section-title { background: #FFCB47; color: #5a4500; font-size: 10pt; font-weight: 700; padding: 4px 14px; letter-spacing: 0.5px; }
  table.kits { width: 100%; border-collapse: collapse; }
  table.kits th, table.kits td { border: 1px solid #d4dbe4; padding: 3px 10px; font-size: 9pt; text-align: center; }
  table.kits thead th { background: #3F88C5; color: #fff; font-weight: 700; }
  table.kits .col-item { text-align: left; }
  table.kits .fornecedor-row td { background: #c8d4e3; color: #2c3e50; font-weight: 700; }
  table.kits .frete-row td.label, table.kits .frete-row td.value { background: #c8d4e3; }
  table.kits .total-row td { background: #ffffff; }
  table.kits .total-frete-row td { background: #c73e2e; color: #fff; font-weight: 700; padding: 6px 10px; }
  table.kits td.value { text-align: right; padding-right: 16px; }
  .frete-note { font-size: 7pt; color: #777; padding: 3px 14px; font-style: italic; }
  table.itens { width: 100%; border-collapse: collapse; }
  table.itens th, table.itens td { border: 1px solid #d4dbe4; padding: 3px 8px; font-size: 8pt; }
  table.itens thead th { background: #3F88C5; color: #fff; font-weight: 700; text-align: center; }
  table.itens td { text-align: left; }
  table.itens td.num { text-align: center; }
  table.itens td.val { text-align: right; }
  .footer-date { text-align: left; padding: 6px 8px 0 8px; font-size: 7pt; color: #555; }
  table.kits, table.itens, .ident-table { page-break-inside: avoid; }
`;

export function buildHtml(snapshot: EnxovalSnapshot): string {
  const r = snapshot.resultado;
  const fornecedorLabel = snapshot.fornecedor;

  const kitRows = KITS.map((k, idx) => {
    const qtd = snapshot.kits[k.cod] ?? 0;
    const valor = r.valorPorKit[k.cod] ?? 0;
    return `
      <tr class="kit-row" data-row-${idx}>
        <td class="col-item">${escapeHtml(k.label)}</td>
        <td>${escapeHtml(k.cod)}</td>
        <td>${qtd}</td>
        <td class="value">${escapeHtml(fmtBRL(valor))}</td>
      </tr>`;
  }).join("");

  // Resumo dos Itens com descrição vinda da Configuração — usamos a primeira linha
  // que case com a descrição (preço já vem do snapshot).
  const itensRows = r.resumoItens
    .map((it) => `
      <tr>
        <td>${escapeHtml(it.descricao)}</td>
        <td class="num">${it.quantidade}</td>
        <td class="val">${escapeHtml(fmtBRL(it.precoUnit))}</td>
        <td class="val">${escapeHtml(fmtBRL(it.total))}</td>
        <td>${escapeHtml(descricaoProduto(it.descricao))}</td>
      </tr>`).join("");

  const proprietarioLabel = snapshot.proprietario.documentoTipo;

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${STYLE}</style></head>
<body>
  <div class="top-bar"></div>
  <div class="ident-block">
    <div class="ident-house">${HOUSE_SVG}</div>
    <table class="ident-table">
      <tr><th>Nome Proprietário</th><td>${escapeHtml(snapshot.proprietario.nome)}</td></tr>
      <tr><th>Telefone</th><td>${escapeHtml(snapshot.proprietario.telefone)}</td></tr>
      <tr><th>${proprietarioLabel}</th><td>${escapeHtml(snapshot.proprietario.documento)}</td></tr>
      <tr><th>Cod Imóvel</th><td>${escapeHtml(snapshot.codigoImovel)}</td></tr>
      <tr><th>Franquia</th><td>${escapeHtml(snapshot.franquia.nome)}</td></tr>
      <tr><th>Telefone da franquia</th><td>${escapeHtml(snapshot.franquia.telefone)}</td></tr>
      <tr><th>Endereço franquia</th><td>${escapeHtml(snapshot.franquia.endereco)}</td></tr>
      <tr><th>Estado</th><td>${escapeHtml(snapshot.franquia.uf)}</td></tr>
      <tr><th>Cidade</th><td>${escapeHtml(snapshot.franquia.cidade)}</td></tr>
      <tr><th>CEP franquia</th><td>${escapeHtml(snapshot.franquia.cep)}</td></tr>
      <tr><th>Região</th><td>${escapeHtml(snapshot.franquia.regiao)}</td></tr>
      <tr><th>É Capital?</th><td>${snapshot.franquia.capital ? "Sim" : "Não"}</td></tr>
      <tr><th>Cluster</th><td>${escapeHtml(snapshot.cluster)}</td></tr>
    </table>
  </div>
  <div class="section-title">RESUMO PEDIDO</div>
  <table class="kits">
    <thead>
      <tr><th class="col-item">ITEM</th><th>KIT</th><th>QTD KIT</th><th>&nbsp;</th></tr>
    </thead>
    <tbody>
      <tr class="fornecedor-row"><td colspan="3"></td><td>${escapeHtml(fornecedorLabel)}</td></tr>
      ${kitRows}
      <tr class="frete-row">
        <td class="label" colspan="3" style="text-align:left; padding-left:14px;">Estimativa Frete*</td>
        <td class="value">${escapeHtml(fmtBRL(r.frete))}</td>
      </tr>
      <tr class="total-row">
        <td colspan="3" style="text-align:left; padding-left:14px;">Valor Total</td>
        <td class="value">${escapeHtml(fmtBRL(r.subtotalKits))}</td>
      </tr>
      <tr class="total-frete-row">
        <td colspan="3" style="text-align:left; padding-left:14px;">Valor Total Com Frete Estimado</td>
        <td class="value">${escapeHtml(fmtBRL(r.totalComFrete))}</td>
      </tr>
    </tbody>
  </table>
  <div class="frete-note">*O Valor do Frete poderá sofrer alterações, pois será calculado para o endereço da Franquia</div>

  <div class="section-title">Resumo dos Itens</div>
  <table class="itens">
    <thead>
      <tr>
        <th style="width:18%">Item</th>
        <th style="width:10%">Quantidade</th>
        <th style="width:14%">Valor Por Item</th>
        <th style="width:14%">Valor total por itens</th>
        <th style="width:44%">Descrição do Item</th>
      </tr>
    </thead>
    <tbody>${itensRows}</tbody>
  </table>
  <div class="footer-date">${escapeHtml(todayBR())}</div>
</body></html>`;
}

const DESCRICOES_PRODUTO: Record<string, string> = {
  "FRONHA": "FRONHA - 200 Fios - 80% Alg. 20% Pol.",
  "TOALHA BANHO": "TOALHA BANHO - 440 G/M2 - 90% Alg. 10% Pol.",
  "TOALHA ROSTO": "TOALHA ROSTO - 440 G/M2 - 90% Alg. 10% Pol.",
  "MANTA QUEEN": "MANTA CINZA QUEEN - 180 G/M2",
  "MANTA QUEEN INVERNO": "MANTA QUEEN INVERNO - 250 G/M2",
  "LENÇOL CASAL": "LENÇOL CASAL S/ ELÁSTICO - Percal 200 Fios - 80% Alg. 20% Pol.",
  "VIROL (Sem Elástico) CASAL": "LENÇOL CASAL S/ ELÁSTICO - Percal 200 Fios - 80% Alg. 20% Pol.",
  "LENÇOL SOLTEIRO": "LENÇOL SOLTEIRO S/ ELÁSTICO - Percal 200 Fios - 80% Alg. 20% Pol.",
  "VIROL (Sem Elástico) SOLTEIRO": "LENÇOL SOLTEIRO S/ ELÁSTICO - Percal 200 Fios - 80% Alg. 20% Pol.",
  "LENÇOL QUEEN": "LENÇOL QUEEN S/ ELÁSTICO - Percal 200 Fios - 80% Alg. 20% Pol.",
  "VIROL (Sem Elástico) QUEEN": "LENÇOL QUEEN S/ ELÁSTICO - Percal 200 Fios - 80% Alg. 20% Pol.",
  "LENÇOL KING": "LENÇOL KING S/ ELÁSTICO - Percal 200 Fios - 80% Alg. 20% Pol.",
  "VIROL (Sem Elástico) KING": "LENÇOL KING S/ ELÁSTICO - Percal 200 Fios - 80% Alg. 20% Pol.",
  "EDREDOM SOLTEIRO": "EDREDOM SOLTEIRO - Microfibra",
  "EDREDOM CASAL": "EDREDOM CASAL - Microfibra",
  "EDREDOM QUEEN": "EDREDOM QUEEN - Microfibra",
  "EDREDOM KING": "EDREDOM KING - Microfibra",
  "CAPA EDREDOM SOLTEIRO": "DUVET SOLTEIRO - 200 Fios - 80% Alg. 20% Pol.",
  "CAPA EDREDOM CASAL": "DUVET CASAL - 200 Fios - 80% Alg. 20% Pol.",
  "CAPA EDREDOM QUEEN": "DUVET QUEEN - 200 Fios - 80% Alg. 20% Pol.",
  "CAPA EDREDOM KING": "DUVET KING - 200 Fios - 80% Alg. 20% Pol.",
  "TAPETE": "Base antiderrapante, felpa 100% poliéster, hipoalergênico, 60 cm x 40 cm, cinza.",
  "MAQUIAGEM": "TOALHA MAQUIAGEM - 100% Alg.",
  "COZINHA": "PANO DE PRATO + PANO DE PIA",
};

function descricaoProduto(descricao: string): string {
  return DESCRICOES_PRODUTO[descricao] ?? "";
}
