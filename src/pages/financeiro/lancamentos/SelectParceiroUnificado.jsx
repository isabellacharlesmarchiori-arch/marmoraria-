const TIPO_LABEL = {
  fornecedor:  'fornecedor',
  funcionario: 'funcionário',
  terceiro:    'terceiro',
};

const SELECT_BASE =
  'bg-[#0a0a0a] border border-zinc-800 px-3 py-2 text-sm text-white outline-none ' +
  'focus:border-yellow-400 transition-colors w-full cursor-pointer';

export default function SelectParceiroUnificado({
  valor,
  onChange,
  tiposPermitidos = ['parceiro', 'arquiteto', 'cliente'],
  parceirosPublicos = [],
  arquitetos        = [],
  clientes          = [],
}) {
  const valorStr = valor ? `${valor.origem}::${valor.id}` : '';

  function handleChange(e) {
    const val = e.target.value;
    if (!val) { onChange(null); return; }
    const sep    = val.indexOf('::');
    const origem = val.slice(0, sep);
    const id     = val.slice(sep + 2);
    onChange({ id, origem });
  }

  const mostrarClientes   = tiposPermitidos.includes('cliente');
  const mostrarArquitetos = tiposPermitidos.includes('arquiteto');
  const mostrarParceiros  = tiposPermitidos.includes('parceiro');

  return (
    <select value={valorStr} onChange={handleChange} className={SELECT_BASE}>
      <option value="">— sem parceiro —</option>

      {mostrarClientes && clientes.length > 0 && (
        <optgroup label="Clientes">
          {clientes.map(c => (
            <option key={c.id} value={`cliente::${c.id}`}>{c.nome}</option>
          ))}
        </optgroup>
      )}

      {mostrarArquitetos && arquitetos.length > 0 && (
        <optgroup label="Arquitetos">
          {arquitetos.map(a => (
            <option key={a.id} value={`arquiteto::${a.id}`}>{a.nome}</option>
          ))}
        </optgroup>
      )}

      {mostrarParceiros && parceirosPublicos.length > 0 && (
        <optgroup label="Fornecedores e funcionários">
          {parceirosPublicos.map(p => {
            const tipo = TIPO_LABEL[p.tipos?.[0]] ?? 'parceiro';
            return (
              <option key={p.id} value={`parceiro::${p.id}`}>
                {p.nome} [{tipo}]
              </option>
            );
          })}
        </optgroup>
      )}
    </select>
  );
}
