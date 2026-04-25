export const CONTRATO_PADRAO = `CLÁUSULA PRIMEIRA — DO OBJETO
O presente contrato tem por objeto a execução de serviços de fornecimento, beneficiamento, transporte e instalação de peças em mármore, granito, quartzo, limestone e demais materiais similares, conforme pedido nº {{numero_pedido}} e projeto executivo aprovado pelo CONTRATANTE.

CLÁUSULA SEGUNDA — DOS PRAZOS
O prazo de execução será contado a partir do último dos seguintes eventos: (i) realização da medição definitiva em obra; (ii) aprovação do projeto executivo; (iii) pagamento do sinal acordado. O prazo previsto é de {{prazo_entrega}}.

CLÁUSULA TERCEIRA — DOS VALORES E PAGAMENTO
O valor total do contrato é de {{valor_total}}, na forma de pagamento {{forma_pagamento}}. O atraso no pagamento sujeitará o CONTRATANTE a multa de 2%, juros de mora de 1% ao mês e correção monetária pelo IGP-M.

CLÁUSULA QUARTA — DA DESISTÊNCIA
A desistência por parte do CONTRATANTE implicará: (i) 10% sobre o valor total se anterior à medição; (ii) 20% se posterior à medição e ao projeto técnico; (iii) pagamento integral se após o início da produção; (iv) custo adicional de 50% sobre matéria-prima específica encomendada.

CLÁUSULA QUINTA — DAS OBRIGAÇÕES DO CONTRATANTE
Disponibilizar acesso à obra; aprovar projeto e especificações; entregar a obra nas condições do Anexo I; comunicar imediatamente avarias; efetuar pagamentos nos prazos; arcar com içamento, caçamba de entulho e acabamento final.

CLÁUSULA SEXTA — DAS OBRIGAÇÕES DA CONTRATADA
Executar com qualidade e observância às normas técnicas; entregar peças conforme especificado; cumprir prazos ressalvado caso fortuito ou força maior; entregar Manual de Manutenção e Termo de Entrega na conclusão.

CLÁUSULA SÉTIMA — DAS LIMITAÇÕES DE RESPONSABILIDADE
A perda de chapa é aceitável até 20%. Não é responsabilidade da CONTRATADA: quebra de alvenaria, instalação hidráulica/elétrica/gás, instalação de acessórios (sifões, torneiras, papeleiras), proteção pós-instalação, vazamentos sobre marcenaria. Mármores e granitos são naturais e variam em cor, veios e tonalidades — não constituindo defeito.

CLÁUSULA OITAVA — DA GARANTIA
A CONTRATADA garante os serviços por 90 (noventa) dias contados da entrega, abrangendo exclusivamente defeitos de instalação, sem prejuízo do art. 26 do Código de Defesa do Consumidor. Excluem-se mau uso, choques, intervenção de terceiros, produtos químicos inadequados e falta de manutenção.

CLÁUSULA NONA — DA COBRANÇA
O inadimplemento sujeita o CONTRATANTE a juros de 1% ao mês, multa moratória de 2%, correção pelo IGP-M, honorários advocatícios de 20% (judicial) ou 10% (extrajudicial). Este contrato é título executivo extrajudicial nos termos do art. 784, III, do CPC.

CLÁUSULA DÉCIMA — DAS DISPOSIÇÕES GERAIS
Alterações somente por escrito assinadas por ambas as partes. A tolerância não constitui novação. Cláusulas inválidas não afetam as demais. Itens do Anexo I não pertinentes ao pedido perdem validade para o caso concreto.

CLÁUSULA DÉCIMA PRIMEIRA — DO FORO
Fica eleito o foro da Comarca de {{cidade_empresa}}, Estado de {{estado_empresa}}, com renúncia a qualquer outro, para dirimir controvérsias decorrentes deste contrato.`;

export const NORMAS_EXECUCAO = [
  '1. Faturamento — O faturamento do pedido poderá ser realizado da seguinte forma: (a) matéria-prima emitida diretamente pelo respectivo fornecedor; (b) beneficiamento e serviços emitidos pela CONTRATADA.',

  '2. Autorização para Execução — O CONTRATANTE autoriza desde já a execução dos serviços descritos no pedido, obrigando-se com o ressarcimento das despesas de execução no caso de desistência antes da conclusão.',

  '3. Medição Definitiva — As medidas constantes do pedido serão confirmadas através de medição definitiva em obra. Diferenças apuradas serão cobradas ou creditadas conforme os valores unitários vigentes da CONTRATADA.',

  '4. Alterações no Pedido — Alterações que gerem saldo favorável ao CONTRATANTE ficam como crédito para uso futuro em novos pedidos ou serviços junto à CONTRATADA. Não há devolução em espécie.',

  '5. Içamento de Peças — Caso seja necessário içamento, o custo fica a cargo do CONTRATANTE. A necessidade é verificada durante a visita técnica para medição.',

  '6. Condições para Início — A data de início é uma previsão e depende da liberação da obra para medição e da aprovação dos desenhos técnicos. O prazo de entrega passa a vigorar a partir da aprovação do projeto técnico, sendo necessário: liberação da obra, pontos hidráulicos e elétricos chumbados, alvenaria requadrada, contrapiso nivelado, impermeabilização finalizada, cubas/tanques entregues à fábrica, modelos dos equipamentos definidos e armários instalados (quando o material for assentado sobre marcenaria).',

  '7. Serviços Não Incluídos — Não é de responsabilidade da CONTRATADA promover quebras, regularização de alvenaria e contrapiso, impermeabilização ou retirada de peças já existentes na obra.',

  '8. Aproveitamento do Material — O corte é feito conforme o melhor aproveitamento da chapa, não podendo a perda ultrapassar 20% (vinte por cento).',

  '9. Escopo da Instalação — O valor de instalação refere-se apenas aos produtos do pedido. A CONTRATADA fica isenta de instalação hidráulica, elétrica, gás e acessórios como sifões, torneiras, porta-toalhas, papeleiras ou furos em louças.',

  '10. Instalação por Terceiros — Quando a mão de obra de instalação não for da CONTRATADA: as medidas para corte devem ser informadas pelo responsável da colocação; a CONTRATADA fica desobrigada de recortes, furos, calafetação e encaixes em obra; e não se responsabiliza pela instalação realizada por terceiros.',

  '11. Projetos e Informações da Obra — É obrigação do CONTRATANTE apresentar projetos que informem passagem de canos, tubulações elétricas e de gás, vigas ou pilares que possam atrapalhar os serviços. Na ausência, o CONTRATANTE arca com custos por imprevistos.',

  '12. Materiais de Assentamento — Materiais para assentamento e rejuntamento (grapas, parafusos, massa plástica) devem ser fornecidos pelo CONTRATANTE quando não adquiridos junto à CONTRATADA.',

  '13. Segurança e Proteção — A responsabilidade pela segurança, proteção, perda, furto ou danos ao material instalado (riscos, quebras, manchas, descolamento) após a entrega é integralmente do CONTRATANTE.',

  '14. Retirada de Entulho — A retirada do entulho, incluindo o fornecimento de caçamba, é de responsabilidade do CONTRATANTE.',

  '15. Danos após Instalação — Caso seja necessário refazer serviços já entregues em razão de danos na obra após a entrega, os custos são arcados pelo CONTRATANTE.',

  '16. Acabamento Final — O acabamento final de alvenaria, azulejos e pintura após a instalação das pedras é providenciado pelo CONTRATANTE.',

  '17. Tampos sobre Marcenaria — Quando tampos forem instalados sobre armários ou marcenaria, a CONTRATADA não se responsabiliza por vazamentos, infiltrações, deformações ou rupturas futuras decorrentes do peso ou esforço sobre eles.',

  '18. Tratamento de Superfícies — Após a instalação de pisos e paredes, recomenda-se tratamento com hidrorrepelente e oleorrepelente, feito por empresa especializada de confiança do CONTRATANTE.',

  '19. Manual e Termo de Entrega — Na conclusão da obra, o CONTRATANTE recebe um Manual de Manutenção e Uso dos materiais e assina o respectivo Termo de Entrega de Obra.',

  '20. Garantia Legal — O prazo de garantia obedece à Cláusula Oitava do contrato e ao Código de Defesa do Consumidor (art. 26), quando aplicável.',

  '21. Alterações após Instalação — Os materiais podem sofrer alterações por sol, chuva, infiltrações, reações químicas com produtos de limpeza, salinidade ou contato com madeira, ferro, areia contaminada, produtos oleosos, gesso e cimento. Tais ocorrências não são de responsabilidade da CONTRATADA.',

  '22. Características Naturais — Mármores, granitos, quartzitos e limestones são materiais naturais sujeitos à variação de cor, veios, tonalidades e texturas. Duas peças jamais serão iguais e essas variações não constituem defeito.',

  '23. Orçamento e Preços — Validade do orçamento de 7 dias da emissão. Preços sujeitos a alteração sem aviso prévio. Materiais importados cotados pelo dólar do dia do orçamento. Mão de obra de instalação não inclusa em determinados materiais. Medidas conferidas in loco podem alterar valores. Início de produção sujeito a liberação da obra e aprovação de projetos executivos.',
];

/**
 * Substitui placeholders {{nome}} no texto das cláusulas.
 * Variáveis aceitas: numero_pedido, valor_total, prazo_entrega,
 * forma_pagamento, cidade_empresa, estado_empresa.
 */
export function renderClausulas(texto, dados) {
  return texto
    .replaceAll('{{numero_pedido}}',   dados.numeroPedido    ?? '____')
    .replaceAll('{{valor_total}}',     dados.valorTotal      ?? '____')
    .replaceAll('{{prazo_entrega}}',   dados.prazoEntrega    ?? '____')
    .replaceAll('{{forma_pagamento}}', dados.formaPagamento  ?? '____')
    .replaceAll('{{cidade_empresa}}',  dados.cidadeEmpresa   ?? '____')
    .replaceAll('{{estado_empresa}}',  dados.estadoEmpresa   ?? '__');
}
