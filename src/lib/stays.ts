// ========================
// Cliente da API Stays (PMS Seazone — ssl.stays.com.br)
// ========================
//
// Doc oficial: https://www.stays.net/external-api/
// Auth: Basic base64(login:senha) — credenciais por app no painel da Stays.
// App dedicada pra esta integração: "Integração API Stays + Claude" (29/29 webhooks).

const STAYS_BASE =
  process.env.STAYS_BASE_URL || "https://ssl.stays.com.br/external/v1";

// Login/senha vêm de env. Fallback embutido (credencial específica desse projeto)
// pra caso a Vercel não tenha a env configurada — substituir por env em prod.
const STAYS_LOGIN = process.env.STAYS_API_LOGIN || "0389d7df";
const STAYS_SENHA = process.env.STAYS_API_SENHA || "a514a65d";

function staysAuthHeader(): string {
  const tok = Buffer.from(`${STAYS_LOGIN}:${STAYS_SENHA}`).toString("base64");
  return `Basic ${tok}`;
}

export async function staysFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith("http")
    ? path
    : `${STAYS_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers: Record<string, string> = {
    Authorization: staysAuthHeader(),
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getStaysListing(listingId: string): Promise<any> {
  const id = encodeURIComponent(listingId);
  const r = await staysFetch(`/content/listings/${id}`);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Stays GET ${listingId} ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

export async function patchStaysListing(
  listingId: string,
  body: Record<string, any>
): Promise<any> {
  const id = encodeURIComponent(listingId);
  const r = await staysFetch(`/content/listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(
      `Stays PATCH ${listingId} ${r.status}: ${txt.slice(0, 200)}`
    );
  }
  return r.json();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface StaysTrocaResult {
  internalNameAntigo: string;
  internalNameNovo: string;
  // Idioma → { antigo, novo } — só os que tinham o código antigo no texto
  titulosAtualizados: Record<string, { antigo: string; novo: string }>;
  // True se o PATCH realmente foi disparado (false = drift, internalName atual já não bate)
  patchEnviado: boolean;
}

// Atualiza internalName + sufixo do _mstitle em todos os idiomas que contêm o código antigo.
// Estratégia conservadora:
//  - Só altera `internalName` se o atual bater com `codigoAntigo` (case-insensitive).
//  - Em cada idioma do `_mstitle`, faz substituição global do `codigoAntigo` por `codigoNovo`.
//  - Se nem o internalName nem nenhum idioma do _mstitle precisam mudar, NÃO dispara o PATCH.
export async function trocarCodigoStays(
  listingId: string,
  codigoAntigo: string,
  codigoNovo: string
): Promise<StaysTrocaResult> {
  const listing = await getStaysListing(listingId);
  const internalNameAntigo: string = listing.internalName || "";
  const mstitle: Record<string, string> =
    (listing._mstitle && typeof listing._mstitle === "object"
      ? listing._mstitle
      : {}) as Record<string, string>;

  const newBody: Record<string, any> = {};
  const titulosAtualizados: Record<
    string,
    { antigo: string; novo: string }
  > = {};

  // 1) internalName
  if (internalNameAntigo.toUpperCase().trim() === codigoAntigo.toUpperCase().trim()) {
    newBody.internalName = codigoNovo;
  }

  // 2) _mstitle por idioma
  const re = new RegExp(escapeRegex(codigoAntigo), "g");
  const newMstitle: Record<string, string> = {};
  let mstitleHasChanges = false;
  for (const [lang, val] of Object.entries(mstitle)) {
    if (typeof val === "string" && val && re.test(val)) {
      const novo = val.replace(re, codigoNovo);
      newMstitle[lang] = novo;
      titulosAtualizados[lang] = { antigo: val, novo };
      mstitleHasChanges = true;
    }
  }
  if (mstitleHasChanges) {
    newBody._mstitle = newMstitle;
  }

  if (Object.keys(newBody).length === 0) {
    return {
      internalNameAntigo,
      internalNameNovo: internalNameAntigo,
      titulosAtualizados: {},
      patchEnviado: false,
    };
  }

  await patchStaysListing(listingId, newBody);

  return {
    internalNameAntigo,
    internalNameNovo: newBody.internalName ?? internalNameAntigo,
    titulosAtualizados,
    patchEnviado: true,
  };
}
