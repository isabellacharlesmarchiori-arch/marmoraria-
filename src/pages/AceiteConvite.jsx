import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AceiteConvite() {
  console.log('🚀 AceiteConvite montado');
  console.log('📍 URL:', window.location.href);
  console.log('📍 Hash:', window.location.hash);
  console.log('📍 Pathname:', window.location.pathname);

  const navigate = useNavigate();
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [errorMsg,        setErrorMsg]        = useState('');
  const [successMsg,      setSuccessMsg]      = useState(false);
  const [userName,        setUserName]        = useState('');
  const [userEmail,       setUserEmail]       = useState('');
  const [userPerfil,      setUserPerfil]      = useState('');
  const [empresaNome,     setEmpresaNome]     = useState('');
  const [sessionReady,    setSessionReady]    = useState(false); // false = ainda verificando

  useEffect(() => {
    console.log('⚡ useEffect executando');

    async function verificarSessao() {
      console.log('🔍 1. Processando token da URL...');

      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const access_token  = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');
      const type          = hashParams.get('type');

      console.log('🔍 2. Tokens extraídos:');
      console.log('   - access_token:', access_token ? 'presente' : 'ausente');
      console.log('   - refresh_token:', refresh_token ? 'presente' : 'ausente');
      console.log('   - type:', type);

      if (!access_token || type !== 'recovery') {
        console.log('❌ Token não encontrado ou tipo inválido');
        setErrorMsg('Link inválido ou expirado. Solicite um novo convite ao administrador.');
        setSessionReady(true);
        return;
      }

      console.log('🔍 3. Tipo recovery detectado, chamando setSession...');

      const { data, error } = await supabase.auth.setSession({
        access_token,
        refresh_token: refresh_token || access_token,
      });

      console.log('🔍 4. Resultado setSession:');
      console.log('   - data:', data);
      console.log('   - error:', error);

      if (error || !data.session?.user) {
        console.error('❌ Erro ao definir sessão:', error);
        setErrorMsg('Link inválido ou expirado. Solicite um novo convite ao administrador.');
        setSessionReady(true);
        return;
      }

      console.log('✅ SESSÃO CRIADA com sucesso!');
      console.log('👤 User ID:', data.session.user.id);

      setUserEmail(data.session.user.email ?? '');

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nome, perfil, empresa_id')
        .eq('id', data.session.user.id)
        .single();

      if (usuario) {
        setUserName(usuario.nome ?? '');
        setUserPerfil(usuario.perfil ?? '');

        if (usuario.empresa_id) {
          const { data: empresa } = await supabase
            .from('empresas')
            .select('nome')
            .eq('id', usuario.empresa_id)
            .single();
          if (empresa) setEmpresaNome(empresa.nome ?? '');
        }
      }

      setSessionReady(true);
    }

    verificarSessao();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (password.length < 8) {
      setErrorMsg('ERRO: A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('ERRO: As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setSuccessMsg(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err) {
      setErrorMsg('ERRO: ' + (err.message ?? 'Não foi possível definir a senha. Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  const perfilLabel = userPerfil === 'admin'    ? 'Administrador'
                    : userPerfil === 'vendedor' ? 'Vendedor'
                    : userPerfil === 'medidor'  ? 'Medidor'
                    : userPerfil;

  return (
    <div className="bg-[#050505] selection:bg-white selection:text-black antialiased relative min-h-screen text-[#a1a1aa] font-sans">

      <div className="fixed inset-0 pointer-events-none z-0 bg-grid"></div>
      <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>

      <main className="relative z-10 w-full min-h-screen flex flex-col md:flex-row">

        {/* ── Coluna Esquerda 60% ─────────────────────────────────────────── */}
        <div className="w-full md:w-[60%] flex flex-col justify-center p-8 md:p-16 lg:px-24">
          <div className="max-w-[480px] w-full mx-auto">

            {/* Logo */}
            <div className="flex items-center gap-4 mb-16">
              <div className="w-3 h-3 bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]"></div>
              <span className="font-bold tracking-tighter text-white uppercase text-xl">Marmora</span>
            </div>

            {/* Estado: verificando sessão */}
            {!sessionReady && (
              <div className="flex items-center gap-3 text-zinc-500 font-mono text-xs uppercase tracking-widest">
                <iconify-icon icon="solar:spinner-linear" className="animate-spin text-lg text-yellow-400"></iconify-icon>
                Verificando convite...
              </div>
            )}

            {/* Estado: link inválido */}
            {sessionReady && errorMsg && !password && (
              <div className="border-l border-yellow-400 bg-yellow-400/5 p-6 mb-8 flex flex-col gap-4">
                <p className="font-mono text-yellow-400 text-xs uppercase tracking-widest leading-relaxed">
                  {errorMsg}
                </p>
                <a
                  href="/login"
                  className="bg-transparent border border-zinc-800 hover:border-yellow-400 hover:text-yellow-400 text-white font-mono text-[10px] uppercase tracking-widest px-6 py-3 transition-colors text-center w-max"
                >
                  Ir para Login
                </a>
              </div>
            )}

            {/* Estado: sessão válida — exibe formulário */}
            {sessionReady && (!errorMsg || password) && (
              <div>
                {/* Título */}
                <div className="mb-8">
                  <div className="text-[10px] font-mono text-yellow-500 mb-6 uppercase tracking-widest border border-yellow-500 w-max px-2 py-1 shadow-[0_0_8px_rgba(250,204,21,0.2)]">
                    [ CONVITE_RECEBIDO ]
                  </div>
                  <h1 className="text-5xl md:text-6xl font-semibold uppercase tracking-tighter leading-[0.9] text-white">
                    Você Foi<br/>
                    <span className="text-zinc-600">Convidado</span>
                  </h1>
                </div>

                {/* Subtexto */}
                <div className="mb-10">
                  <p className="font-mono text-zinc-400 text-sm border-l border-white pl-4">
                    O administrador da empresa te convidou para acessar o sistema.
                  </p>
                </div>

                {/* Card de contexto com dados reais */}
                <div className="bg-[#020202] border border-zinc-800 p-4 mb-8 flex flex-col gap-4">
                  {empresaNome && (
                    <div>
                      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Empresa</div>
                      <div className="text-white font-medium text-sm">{empresaNome}</div>
                    </div>
                  )}
                  <div className="flex gap-8">
                    {perfilLabel && (
                      <div>
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Seu Perfil</div>
                        <div className="px-2 py-0.5 bg-yellow-400/10 border border-yellow-400/30 text-yellow-500 font-mono text-[10px] uppercase tracking-widest w-max flex items-center gap-1.5">
                          <div className="w-1 h-1 bg-yellow-400 rounded-full animate-pulse shadow-[0_0_5px_rgba(250,204,21,0.5)]"></div>
                          {perfilLabel}
                        </div>
                      </div>
                    )}
                    {userEmail && (
                      <div>
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Email</div>
                        <div className="text-zinc-400 font-mono text-sm">{userEmail}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Erro de validação / API */}
                {errorMsg && (
                  <div className="border-l border-yellow-400 bg-yellow-400/5 p-4 mb-6">
                    <p className="font-mono text-yellow-400 text-xs uppercase tracking-widest">{errorMsg}</p>
                  </div>
                )}

                {/* Sucesso */}
                {successMsg && (
                  <div className="border-l border-white bg-[rgba(255,255,255,0.03)] p-4 mb-6">
                    <p className="font-mono text-white text-xs uppercase tracking-widest flex items-center gap-2">
                      CONTA ATIVADA. Redirecionando para o dashboard...
                      <iconify-icon icon="solar:spinner-linear" className="animate-spin text-lg"></iconify-icon>
                    </p>
                  </div>
                )}

                {/* Formulário */}
                {!successMsg && (
                  <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>

                    {/* Criar Senha */}
                    <div>
                      <label className="text-xs uppercase font-mono text-zinc-500 block mb-2">Criar Senha</label>
                      <div className="relative">
                        <iconify-icon icon="solar:lock-password-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-lg"></iconify-icon>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); setErrorMsg(''); }}
                          placeholder="••••••••"
                          required
                          minLength={8}
                          disabled={loading}
                          className="w-full bg-black border border-zinc-800 text-white text-sm px-10 py-4 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.2)] transition-colors placeholder:text-zinc-700 font-mono tracking-widest"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white transition-colors flex items-center justify-center p-1"
                        >
                          <iconify-icon icon={showPassword ? 'solar:eye-closed-linear' : 'solar:eye-linear'} className="text-lg"></iconify-icon>
                        </button>
                      </div>
                    </div>

                    {/* Confirmar Senha */}
                    <div>
                      <label className="text-xs uppercase font-mono text-zinc-500 block mb-2">Confirmar Senha</label>
                      <div className="relative">
                        <iconify-icon icon="solar:lock-password-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-lg"></iconify-icon>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => { setConfirmPassword(e.target.value); setErrorMsg(''); }}
                          placeholder="••••••••"
                          required
                          minLength={8}
                          disabled={loading}
                          className="w-full bg-black border border-zinc-800 text-white text-sm px-10 py-4 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.2)] transition-colors placeholder:text-zinc-700 font-mono tracking-widest"
                        />
                      </div>
                    </div>

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-4 w-full bg-yellow-400 text-black text-sm font-bold uppercase tracking-widest px-8 py-5 border border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)] hover:shadow-[0_0_25px_rgba(250,204,21,0.5)] disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 rounded-none"
                    >
                      <span>{loading ? 'Ativando...' : 'Ativar Conta'}</span>
                      <iconify-icon
                        icon={loading ? 'solar:spinner-linear' : 'solar:arrow-right-linear'}
                        className={loading ? 'animate-spin' : ''}
                        width="20"
                      ></iconify-icon>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Coluna Direita 40% ──────────────────────────────────────────── */}
        <div className="hidden md:flex w-[40%] bg-zinc-950 border-l border-zinc-800 p-12 flex-col justify-between relative overflow-hidden">

          <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none"></div>

          <div className="flex justify-between items-start relative z-10 w-full">
            <div className="bg-black border border-yellow-400/30 px-3 py-1 font-mono text-[10px] text-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.2)]">
              CAM_LIVE [02]
            </div>
            <div className="w-12 h-12 border border-yellow-400/30 rounded-full flex justify-center items-center">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(250,204,21,0.8)]"></div>
            </div>
          </div>

          <div className="absolute w-full h-[1px] bg-white opacity-20 top-1/2 -translate-y-1/2 shadow-[0_0_10px_rgba(255,255,255,0.5)] left-0"></div>
          <div className="absolute h-full w-[1px] bg-white opacity-20 left-1/2 -translate-x-1/2 shadow-[0_0_10px_rgba(255,255,255,0.5)] top-0"></div>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <iconify-icon icon="solar:user-plus-linear" width="120" className="text-zinc-800"></iconify-icon>
          </div>

          <div className="relative z-10 font-mono text-[10px] text-zinc-500 text-right w-full mt-auto">
            INVITE_TOKEN: <span className="text-white font-bold">{sessionReady && !errorMsg ? 'VALIDATED' : 'PENDING'}</span><br/>
            ACCESS_LEVEL: <span className="text-yellow-400 font-bold">{successMsg ? 'ACTIVE' : 'PENDING_ACTIVATION'}</span>
          </div>
        </div>

      </main>
    </div>
  );
}
