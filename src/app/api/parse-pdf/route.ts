import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/pipefy";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require("@/lib/pdf-parse");

interface ParsedEnxoval {
  codigo_imovel: string;
  fronha: number;
  toalha_de_banho: number;
  toalha_de_rosto: number;
  toalha_de_piso: number;
  toalha_de_maquiagem: number;
  toalha_de_praia: number;
  manta_queen_size: number;
  lencol_ou_virol_solteiro: number;
  lencol_ou_virol_casal: number;
  lencol_ou_virol_queen_size: number;
  lencol_ou_virol_king_size: number;
  edredom_solteiro: number;
  edredom_casal: number;
  edredom_queen_size: number;
  edredom_king_size: number;
  capa_edredom_solteiro: number;
  capa_edredom_casal: number;
  capa_edredom_queen_size: number;
  capa_edredom_king_size: number;
}

function getItemQty(lines: string[], itemName: string, exactEnd = false): number {
  const escaped = itemName.replace(/[()]/g, "\\$&");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pattern 1: quantity glued to name — "FRONHA12" or "TOALHA BANHO6"
    const gluedRegex = exactEnd
      ? new RegExp("^" + escaped + "(\\d+)$")
      : new RegExp("^" + escaped + "(\\d+)");
    const gluedMatch = line.match(gluedRegex);
    if (gluedMatch) {
      // If exactEnd, make sure there's no extra text after number that would indicate a different item
      return parseInt(gluedMatch[1], 10);
    }

    // Pattern 2: name with space/tab then quantity — "FRONHA 12 R$"
    const spacedRegex = exactEnd
      ? new RegExp("^" + escaped + "[\\s\\t]+(\\d+)")
      : new RegExp("^" + escaped + "[\\s\\t]+(\\d+)");
    const spacedMatch = line.match(spacedRegex);
    if (spacedMatch) {
      // For exactEnd, verify the match is exact (e.g. "MANTA QUEEN" should NOT match "MANTA QUEEN INVERNO")
      if (exactEnd) {
        const afterName = line.substring(itemName.length);
        if (/^[A-Z]/.test(afterName.trim())) continue; // skip, it's a longer item name
      }
      return parseInt(spacedMatch[1], 10);
    }

    // Pattern 3: exact name on this line, quantity on next line
    const isExactLine = line === itemName;
    const startsWithName = line.startsWith(itemName);

    if (isExactLine || startsWithName) {
      // If exactEnd and line has more text after name, check it's not a different item
      if (exactEnd && !isExactLine) {
        const rest = line.substring(itemName.length).trim();
        if (rest && /^[A-Z]/.test(rest)) continue; // "MANTA QUEEN INVERNO" — skip
      }

      // Check next line for quantity
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        // Pure number
        if (/^\d+$/.test(nextLine)) {
          return parseInt(nextLine, 10);
        }
        // Number followed by space/text (e.g. "9 R$ 42,75")
        const nextMatch = nextLine.match(/^(\d+)\s/);
        if (nextMatch) return parseInt(nextMatch[1], 10);
      }
    }
  }

  // Fallback: search full text
  const fullText = lines.join("\n");

  // "ITEM\n3\n"
  const nlRegex = new RegExp(escaped + "\\s*\\n(\\d+)(?:\\n|$)");
  const nlMatch = fullText.match(nlRegex);
  if (nlMatch) return parseInt(nlMatch[1], 10);

  // "ITEM3\n" (glued in full text)
  const gluedFull = new RegExp(escaped + "(\\d+)(?:\\n|$)");
  const gfMatch = fullText.match(gluedFull);
  if (gfMatch) return parseInt(gfMatch[1], 10);

  return 0;
}

function parsePdfText(text: string): ParsedEnxoval {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Extract Cod Imóvel
  const codIdx = lines.findIndex((l) => l.startsWith("Cod Imóvel") || l.startsWith("Cod Im"));
  let codigo_imovel = "";
  if (codIdx >= 0) {
    const match = lines[codIdx].match(/Cod\s*Im[óo]vel\s*([A-Z]{2,5}\d{3,5})/i);
    if (match) {
      codigo_imovel = match[1];
    } else if (codIdx + 1 < lines.length) {
      codigo_imovel = lines[codIdx + 1].trim();
    }
  }

  // Parse quantities from "Resumo dos Itens" section
  const fronha = getItemQty(lines, "FRONHA");
  const toalha_de_banho = getItemQty(lines, "TOALHA BANHO");
  const toalha_de_rosto = getItemQty(lines, "TOALHA ROSTO");
  const toalha_de_piso = getItemQty(lines, "TOALHA PISO") || getItemQty(lines, "TAPETE");
  const toalha_de_maquiagem = getItemQty(lines, "MAQUIAGEM");
  const toalha_de_praia = getItemQty(lines, "TOALHA DE PRAIA") || getItemQty(lines, "TOALHA PRAIA");

  // Manta queen: INVERNO first (more specific), then generic with exactEnd to avoid matching INVERNO
  const manta_queen_inverno = getItemQty(lines, "MANTA QUEEN INVERNO");
  const manta_queen = getItemQty(lines, "MANTA QUEEN", true); // exactEnd to NOT match "MANTA QUEEN INVERNO"

  // Lençol + Virol per size
  const lencol_solteiro = getItemQty(lines, "LENÇOL SOLTEIRO");
  const virol_solteiro = getItemQty(lines, "VIROL (Sem Elástico) SOLTEIRO");
  const lencol_casal = getItemQty(lines, "LENÇOL CASAL");
  const virol_casal = getItemQty(lines, "VIROL (Sem Elástico) CASAL");
  const lencol_queen = getItemQty(lines, "LENÇOL QUEEN");
  const virol_queen = getItemQty(lines, "VIROL (Sem Elástico) QUEEN");
  const lencol_king = getItemQty(lines, "LENÇOL KING");
  const virol_king = getItemQty(lines, "VIROL (Sem Elástico) KING");

  const edredom_solteiro = getItemQty(lines, "EDREDOM SOLTEIRO");
  const edredom_casal = getItemQty(lines, "EDREDOM CASAL");
  const edredom_queen = getItemQty(lines, "EDREDOM QUEEN");
  const edredom_king = getItemQty(lines, "EDREDOM KING");

  const capa_solteiro = getItemQty(lines, "CAPA EDREDOM SOLTEIRO");
  const capa_casal = getItemQty(lines, "CAPA EDREDOM CASAL");
  const capa_queen = getItemQty(lines, "CAPA EDREDOM QUEEN");
  const capa_king = getItemQty(lines, "CAPA EDREDOM KING");

  return {
    codigo_imovel,
    fronha,
    toalha_de_banho,
    toalha_de_rosto,
    toalha_de_piso,
    toalha_de_maquiagem,
    toalha_de_praia,
    manta_queen_size: manta_queen + manta_queen_inverno,
    lencol_ou_virol_solteiro: lencol_solteiro + virol_solteiro,
    lencol_ou_virol_casal: lencol_casal + virol_casal,
    lencol_ou_virol_queen_size: lencol_queen + virol_queen,
    lencol_ou_virol_king_size: lencol_king + virol_king,
    edredom_solteiro,
    edredom_casal,
    edredom_queen_size: edredom_queen,
    edredom_king_size: edredom_king,
    capa_edredom_solteiro: capa_solteiro,
    capa_edredom_casal: capa_casal,
    capa_edredom_queen_size: capa_queen,
    capa_edredom_king_size: capa_king,
  };
}

export async function POST(request: NextRequest) {
  if (!requireAuth(request.cookies.get("auth_token")?.value)) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum PDF enviado" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await pdf(buffer);
    const parsed = parsePdfText(data.text);

    return NextResponse.json({ success: true, data: parsed, rawText: data.text });
  } catch (error) {
    console.error("Erro ao parsear PDF:", error);
    return NextResponse.json(
      { error: "Erro ao processar o PDF" },
      { status: 500 }
    );
  }
}
