/**
 * Configurações Fiscais Globais (Brasil - 2024/2025)
 * Centraliza as alíquotas e valores que mudam raramente (geralmente 1x ao ano).
 */

export const TAX_RATES = {
  // MEI: Valor fixo mensal baseado no salário mínimo de 2024 (R$ 1.412,00)
  // 5% INSS + ISS (R$ 5,00). Total aprox. R$ 75,60
  MEI_FIXED_VALUE: 75.60,

  // Simples Nacional: Alíquotas base por anexo
  // Barbearias geralmente se enquadram no Anexo III (Serviços) 
  SIMPLES_NACIONAL: {
    DEFAULT_RATE: 6.0, // Alíquota inicial da 1ª faixa (até R$ 180k/ano)
    ANEXO_III_START: 6.0,
  },

  // Lucro Presumido: Soma aproximada de impostos federais e municipais para serviços
  // (PIS 0.65% + COFINS 3% + IRPJ 4.8% + CSLL 2.88% + ISS ~2% a 5%)
  LUCRO_PRESUMIDO: {
    ESTIMATED_TOTAL_RATE: 15.0,
  }
};

/**
 * Função utilitária para calcular o imposto estimado com base no regime
 */
export const calculateEstimatedTax = (regime, taxableRevenue, customRate = null, months = 1) => {
  const activeMonths = Math.max(1, months);

  switch (regime) {
    case "MEI":
      // O MEI é um valor fixo por mês de operação
      return TAX_RATES.MEI_FIXED_VALUE * activeMonths;
      
    case "Simples Nacional":
      const rate = (customRate || TAX_RATES.SIMPLES_NACIONAL.DEFAULT_RATE) / 100;
      return taxableRevenue * rate;
      
    case "Lucro Presumido":
      return taxableRevenue * (TAX_RATES.LUCRO_PRESUMIDO.ESTIMATED_TOTAL_RATE / 100);
      
    default:
      return 0;
  }
};
