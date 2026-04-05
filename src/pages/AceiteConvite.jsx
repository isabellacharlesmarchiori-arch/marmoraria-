import React, { useState, useEffect } from 'react';

export default function AceiteConvite() {
    const [isInvalidToken, setIsInvalidToken] = useState(false);
    const [nome, setNome] = useState('Maria Silva');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('sys-active');
                }
            });
        }, observerOptions);
        document.querySelectorAll('.sys-reveal').forEach(el => observer.observe(el));
        
        // Simular Validação de Token (Para teste)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('invalid')) {
            setIsInvalidToken(true);
        }

        return () => observer.disconnect();
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (password.length < 8) {
            setErrorMsg("ERRO: A senha deve ter no mínimo 8 caracteres.");
            return;
        }

        if (password !== confirmPassword) {
            setErrorMsg("ERRO: As senhas não coincidem.");
            return;
        }

        setLoading(true);

        setTimeout(() => {
            setSuccessMsg(true);
            setLoading(false);
            
            // Simula redirecionamento
            setTimeout(() => {
                window.location.href = '/login';
            }, 2000);
        }, 1500);
    };

    return (
        <div className="bg-[#050505] selection:bg-white selection:text-black antialiased relative min-h-screen text-[#a1a1aa] font-sans">
            
            <div className="fixed inset-0 pointer-events-none z-0 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>

            <main className="relative z-10 w-full min-h-screen flex flex-col md:flex-row">
                
                {/* Coluna Esquerda 60% */}
                <div className="w-full md:w-[60%] flex flex-col justify-center p-8 md:p-16 lg:px-24">
                    <div className="max-w-[480px] w-full mx-auto">
                        
                        {/* Cabeçalho / Logo */}
                        <div className="sys-reveal flex items-center gap-4 mb-16">
                            <div className="w-3 h-3 bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]"></div>
                            <span className="font-bold tracking-tighter text-white uppercase text-xl">Marmora</span>
                        </div>

                        {/* Mensagem de Erro (Convite Inválido) */}
                        {isInvalidToken ? (
                            <div className="sys-reveal border-l border-yellow-400 bg-yellow-400/5 p-6 mb-8 flex flex-col gap-4">
                                <p className="font-mono text-yellow-400 text-xs uppercase tracking-widest leading-relaxed">
                                    ERRO: Convite inválido ou expirado. Solicite um novo convite ao administrador.
                                </p>
                                <a href="/login" className="bg-transparent border border-zinc-800 hover:border-yellow-400 hover:text-yellow-400 text-white font-mono text-[10px] uppercase tracking-widest px-6 py-3 transition-colors text-center w-max rounded-none mt-2">
                                    Ir para Login
                                </a>
                            </div>
                        ) : (
                            /* Container Principal do Convite */
                            <div id="inviteContainer">
                                {/* Título */}
                                <div className="sys-reveal mb-8">
                                    <div className="text-[10px] font-mono text-yellow-500 mb-6 uppercase tracking-widest border border-yellow-500 w-max px-2 py-1 shadow-[0_0_8px_rgba(250,204,21,0.2)]">[ CONVITE_RECEBIDO ]</div>
                                    <h1 className="text-5xl md:text-6xl font-semibold uppercase tracking-tighter leading-[0.9] text-white">
                                        Você Foi<br/>
                                        <span className="text-zinc-600">Convidado</span>
                                    </h1>
                                </div>

                                {/* Subtexto */}
                                <div className="sys-reveal mb-10">
                                    <p className="font-mono text-zinc-400 text-sm border-l border-white pl-4">O administrador da empresa te convidou para acessar o sistema.</p>
                                </div>

                                {/* Card de Contexto */}
                                <div className="sys-reveal bg-[#020202] border border-zinc-800 p-4 mb-8 flex flex-col gap-4">
                                    <div>
                                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Empresa</div>
                                        <div className="text-white font-medium text-sm">Marmoraria Silva Ltda.</div>
                                    </div>
                                    <div className="flex gap-8">
                                        <div>
                                            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Seu Perfil</div>
                                            <div className="px-2 py-0.5 bg-yellow-400/10 border border-yellow-400/30 text-yellow-500 font-mono text-[10px] uppercase tracking-widest w-max flex items-center gap-1.5">
                                                <div className="w-1 h-1 bg-yellow-400 rounded-full animate-pulse shadow-[0_0_5px_rgba(250,204,21,0.5)]"></div>
                                                Vendedor
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Email</div>
                                            <div className="text-zinc-400 font-mono text-sm">maria.silva@email.com</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Mensagens Form */}
                                {errorMsg && (
                                    <div className="sys-reveal border-l border-yellow-400 bg-yellow-400/5 p-4 mb-6">
                                        <p className="font-mono text-yellow-400 text-xs uppercase tracking-widest">{errorMsg}</p>
                                    </div>
                                )}

                                {successMsg && (
                                    <div className="sys-reveal border-l border-white bg-[rgba(255,255,255,0.03)] p-4 mb-6">
                                        <p className="font-mono text-white text-xs uppercase tracking-widest flex items-center gap-2">
                                            CONTA ATIVADA. Redirecionando para o login... <iconify-icon icon="solar:spinner-linear" className="animate-spin text-lg"></iconify-icon>
                                        </p>
                                    </div>
                                )}

                                {/* Formulário */}
                                {!successMsg && (
                                    <form onSubmit={handleSubmit} className="flex flex-col gap-6 sys-reveal sys-delay-100" noValidate>
                                        
                                        {/* Seu nome */}
                                        <div>
                                            <label className="text-xs uppercase font-mono text-zinc-500 block mb-2">Seu Nome</label>
                                            <div className="relative">
                                                <iconify-icon icon="solar:user-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-lg"></iconify-icon>
                                                <input 
                                                    type="text" 
                                                    value={nome}
                                                    onChange={(e) => setNome(e.target.value)}
                                                    placeholder="Maria Silva" 
                                                    required
                                                    disabled={loading}
                                                    className="w-full bg-black border border-zinc-800 text-white text-sm px-10 py-4 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.2)] transition-colors placeholder:text-zinc-700" 
                                                />
                                            </div>
                                        </div>

                                        {/* Criar Senha */}
                                        <div>
                                            <label className="text-xs uppercase font-mono text-zinc-500 block mb-2">Criar Senha</label>
                                            <div className="relative">
                                                <iconify-icon icon="solar:lock-password-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-lg"></iconify-icon>
                                                <input 
                                                    type={showPassword ? "text" : "password"} 
                                                    value={password}
                                                    onChange={(e) => {setPassword(e.target.value); setErrorMsg('');}}
                                                    placeholder="••••••••" 
                                                    required 
                                                    minLength="8"
                                                    disabled={loading}
                                                    className="w-full bg-black border border-zinc-800 text-white text-sm px-10 py-4 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.2)] transition-colors placeholder:text-zinc-700 font-mono tracking-widest" 
                                                />
                                                <button 
                                                    type="button" 
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white transition-colors flex items-center justify-center p-1"
                                                >
                                                    <iconify-icon icon={showPassword ? "solar:eye-closed-linear" : "solar:eye-linear"} className="text-lg"></iconify-icon>
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
                                                    onChange={(e) => {setConfirmPassword(e.target.value); setErrorMsg('');}}
                                                    placeholder="••••••••" 
                                                    required 
                                                    minLength="8"
                                                    disabled={loading}
                                                    className="w-full bg-black border border-zinc-800 text-white text-sm px-10 py-4 rounded-none focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_10px_rgba(250,204,21,0.2)] transition-colors placeholder:text-zinc-700 font-mono tracking-widest" 
                                                />
                                            </div>
                                        </div>

                                        {/* Botão Submit */}
                                        <button 
                                            type="submit" 
                                            disabled={loading}
                                            className="mt-4 w-full bg-yellow-400 text-black text-sm font-bold uppercase tracking-widest px-8 py-5 border border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)] hover:shadow-[0_0_25px_rgba(250,204,21,0.5)] disabled:opacity-50 disabled:shadow-none disabled:hover:shadow-none disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 rounded-none"
                                        >
                                            <span>{loading ? 'Ativando...' : 'Ativar Conta'}</span>
                                            <iconify-icon icon={loading ? "solar:spinner-linear" : "solar:arrow-right-linear"} className={loading ? "animate-spin" : ""} width="20"></iconify-icon>
                                        </button>
                                    </form>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Coluna Direita 40% */}
                <div className="hidden md:flex w-[40%] bg-zinc-950 border-l border-zinc-800 p-12 flex-col justify-between relative overflow-hidden group">
                    
                    {/* Grid Fundo Exclusivo */}
                    <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none"></div>

                    {/* Cam Live */}
                    <div className="flex justify-between items-start relative z-10 w-full sys-reveal">
                        <div className="bg-black border border-yellow-400/30 px-3 py-1 font-mono text-[10px] text-yellow-400 sys-flicker-anim shadow-[0_0_10px_rgba(250,204,21,0.2)]">
                            CAM_LIVE [02]
                        </div>
                        <div className="w-12 h-12 border border-yellow-400/30 rounded-full flex justify-center items-center">
                            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(250,204,21,0.8)]"></div>
                        </div>
                    </div>

                    {/* Linhas Cruzadas */}
                    <div className="absolute w-full h-[1px] bg-white opacity-20 top-1/2 -translate-y-1/2 shadow-[0_0_10px_rgba(255,255,255,0.5)] left-0"></div>
                    <div className="absolute h-full w-[1px] bg-white opacity-20 left-1/2 -translate-x-1/2 shadow-[0_0_10px_rgba(255,255,255,0.5)] top-0"></div>

                    {/* Ícone Central */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 sys-reveal">
                        <iconify-icon icon="solar:user-plus-linear" width="120" className="text-zinc-800"></iconify-icon>
                    </div>

                    {/* Dados Técnicos */}
                    <div className="relative z-10 font-mono text-[10px] text-zinc-500 text-right w-full mt-auto sys-reveal">
                        INVITE_TOKEN: <span className="text-white font-bold">VALIDATED</span><br/>
                        ACCESS_LEVEL: <span className="text-yellow-400 font-bold">PENDING_ACTIVATION</span>
                    </div>
                </div>

            </main>
        </div>
    );
}
