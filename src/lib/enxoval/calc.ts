import configuracao from "./data/configuracao.json";
import estimativaFrete from "./data/estimativa-frete.json";

export type Fornecedor = "MATINALI" | "RM Enxoval";
export type Cluster = "Padrão" | "Inverno" | "Extremo Inverno";

export type ConfigRow = {
  cod: string;
  item: string;
  regiao: string; // "TODOS" | "Padrão" | "Inverno" | "Extremo Inverno"
  descricao: string;
  quantidade: number;
  qtd_fixa: boolean;
  mudas: number;
  preco_matinali: number;
  preco_rm: number;
};

export type FreteRow = {
  MATINALI_INTERIOR: number | null;
  MATINALI_CAPITAL: number | null;
  RM_INTERIOR: number | null;
  RM_CAPITAL: number | null;
};

export const CONFIG: ConfigRow[] = configuracao as ConfigRow[];
export const FRETE: Record<string, FreteRow> = estimativaFrete as Record<string, FreteRow>;

export const KITS = [
  { cod: "0.1",  label: "Cama Solteiro" },
  { cod: "0.2",  label: "Cama Casal" },
  { cod: "0.3",  label: "Cama Queen" },
  { cod: "0.4",  label: "Cama King" },
  { cod: "0.5",  label: "Sofá-cama solteiro" },
  { cod: "0.6",  label: "Sofá-cama casal" },
  { cod: "0.7",  label: "Banheiros" },
  { cod: "0.8",  label: "Lavabos" },
  { cod: "0.9",  label: "Jacuzzis/Banheira " },
  { cod: "0.10", label: "Cozinhas" },
  { cod: "0.11", label: "Toalha Maquiagem" },
] as const;

/** Decide fornecedor pela região (Norte/Nordeste = RM Enxoval, resto = MATINALI). */
export function escolherFornecedor(regiao: string | null | undefined): Fornecedor {
  const r = (regiao ?? "").trim();
  return r === "Nordeste" || r === "Norte" ? "RM Enxoval" : "MATINALI";
}

/** Calcula frete pela tabela `Estimativa de frete` (UF × fornecedor × capital). */
export function calcularFrete(
  uf: string | null | undefined,
  fornecedor: Fornecedor,
  capital: boolean
): number {
  if (!uf) return 0;
  const linha = FRETE[uf.trim().toUpperCase()];
  if (!linha) return 0;
  const valor =
    fornecedor === "MATINALI"
      ? capital
        ? linha.MATINALI_CAPITAL
        : linha.MATINALI_INTERIOR
      : capital
        ? linha.RM_CAPITAL
        : linha.RM_INTERIOR;
  return typeof valor === "number" ? valor : 0;
}

export type KitsImovel = Partial<Record<string, number>>; // cod → qtd

export type ItemAgregado = {
  descricao: string;
  quantidade: number;
  precoUnit: number;
  total: number;
};

export type ResultadoCalculo = {
  fornecedor: Fornecedor;
  cluster: Cluster;
  valorPorKit: Record<string, number>; // cod → valor (já × qtdKit)
  subtotalKits: number;                // D32
  frete: number;                       // D31
  totalComFrete: number;               // D33
  promocaoBlackFriday: number;         // D34
  resumoItens: ItemAgregado[];         // por DESCRIÇÃO
};

/**
 * Replica `calcularEnxovalResumoAdequacao` + agregação D38:E62.
 * Para cada linha da Configuração que casa com (clima do imóvel ou "TODOS"),
 * acumula `preço × mudas × quantidade` no kit correspondente; multiplica pelo
 * número de kits do imóvel. Resumo dos Itens reagrupa por DESCRIÇÃO.
 */
export function calcularEnxoval(
  kits: KitsImovel,
  cluster: Cluster,
  fornecedor: Fornecedor,
  uf: string | null | undefined,
  capital: boolean
): ResultadoCalculo {
  const precoField: keyof ConfigRow =
    fornecedor === "RM Enxoval" ? "preco_rm" : "preco_matinali";

  const totaisPorKit: Record<string, number> = {};
  const agregadoPorDescricao: Record<string, { qtd: number; preco: number }> = {};

  for (const row of CONFIG) {
    if (row.regiao !== "TODOS" && row.regiao !== cluster) continue;
    const preco = row[precoField] as number;
    if (!preco) {
      // ainda contribui com qtd no resumo dos itens, mas valor zero
    }
    const qtdKit = kits[row.cod] ?? 0;
    if (qtdKit <= 0) continue;

    const valorContrib = preco * row.mudas * row.quantidade;
    totaisPorKit[row.cod] = (totaisPorKit[row.cod] ?? 0) + valorContrib;

    const qtdItem = row.quantidade * row.mudas * qtdKit;
    if (qtdItem > 0) {
      const acc = (agregadoPorDescricao[row.descricao] ??= { qtd: 0, preco });
      acc.qtd += qtdItem;
      // Preço pega o último visto (são iguais entre linhas mesma DESCRIÇÃO)
      acc.preco = preco;
    }
  }

  const valorPorKit: Record<string, number> = {};
  let subtotal = 0;
  for (const { cod } of KITS) {
    const tot = (totaisPorKit[cod] ?? 0) * (kits[cod] ?? 0);
    valorPorKit[cod] = tot;
    subtotal += tot;
  }

  const frete = calcularFrete(uf, fornecedor, capital);

  const resumoItens: ItemAgregado[] = Object.entries(agregadoPorDescricao)
    .map(([descricao, { qtd, preco }]) => ({
      descricao,
      quantidade: qtd,
      precoUnit: preco,
      total: qtd * preco,
    }))
    .filter((r) => r.quantidade > 0)
    .sort((a, b) => b.quantidade - a.quantidade);

  return {
    fornecedor,
    cluster,
    valorPorKit,
    subtotalKits: subtotal,
    frete,
    totalComFrete: subtotal + frete,
    promocaoBlackFriday: subtotal * 0.95 + frete,
    resumoItens,
  };
}

/** Helper: BRL formatter (sem dependência externa). */
export function fmtBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}
