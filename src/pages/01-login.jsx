import React, { useState, useEffect } from 'react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
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
        return () => observer.disconnect();
    }, []);

    const resetErrors = () => {
        setEmailError('');
        setPasswordError('');
    };

    const handleEmailChange = (e) => {
        setEmail(e.target.value);
        resetErrors();
    };

    const handlePasswordChange = (e) => {
        setPassword(e.target.value);
        resetErrors();
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        resetErrors();

        let hasError = false;

        if (!email) {
            setEmailError("Campo obrigatório");
            hasError = true;
        } else if (!email.includes('@')) {
            setEmailError("Credenciais inválidas — verifique e tente novamente");
            hasError = true;
        }
        
        if (!password) {
            setPasswordError("Campo obrigatório");
            hasError = true;
        }

        if (hasError) return;

        setLoading(true);

        setTimeout(() => {
            setLoading(false);
            alert('Autenticação concluída! [simulação do redirecionamento]');
        }, 1500);
    };

    return (
        <div className="bg-[#050505] selection:bg-white selection:text-black antialiased relative min-h-screen text-[#a1a1aa] font-sans">
            
            {/* Backgrounds */}
            <div className="fixed inset-0 pointer-events-none z-0 bg-grid"></div>
            <div className="fixed inset-0 pointer-events-none z-0 scanline mix-blend-overlay"></div>

            <main className="relative z-10 w-full min-h-screen flex flex-col md:flex-row">
                
                {/* Coluna Esquerda 60% */}
                <div className="w-full md:w-[60%] flex flex-col justify-center p-8 md:p-16 lg:px-24">
                    <div className="max-w-[420px] w-full mx-auto">
                        
                        {/* Cabeçalho */}
                        <div className="sys-reveal flex items-center gap-4 mb-16">
                            <div className="w-3 h-3 bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]"></div>
                            <span className="font-bold tracking-tighter text-white uppercase text-xl">Marmoraria</span>
                        </div>

                        {/* Título */}
                        <div className="sys-reveal mb-12">
                            <div className="text-[10px] font-mono text-white mb-6 uppercase tracking-widest border border-zinc-800 w-max px-2 py-1">01 // Autenticação</div>
                            <h1 className="text-5xl md:text-6xl font-semibold uppercase tracking-tighter leading-[0.9] text-white">
                                Acesso<br/>
                                <span className="text-zinc-600">Ao Sistema</span>
                            </h1>
                        </div>

                        {/* Formulário */}
                        <form onSubmit={handleSubmit} className="flex flex-col gap-6 sys-reveal sys-delay-100" noValidate>
                            {/* Email */}
                            <div>
                                <label className="text-xs uppercase font-mono text-zinc-500 block mb-2">Identificador de acesso</label>
                                <div className="relative">
                                    <iconify-icon icon="solar:user-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-lg"></iconify-icon>
                                    <input 
                                        type="email" 
                                        value={email}
                                        onChange={handleEmailChange}
                                        placeholder="seu.id@marmoraria.com.br" 
                                        required
                                        className={`w-full bg-black border ${emailError ? 'border-red-500 focus:border-red-500' : 'border-zinc-800 focus:border-yellow-400'} text-white text-sm px-10 py-4 rounded-none focus:outline-none focus:shadow-[0_0_10px_rgba(250,204,21,0.2)] transition-colors placeholder:text-zinc-700`} 
                                    />
                                </div>
                                {emailError && <p className="text-red-400 text-xs font-mono mt-2">{emailError}</p>}
                            </div>

                            {/* Senha */}
                            <div>
                                <label className="text-xs uppercase font-mono text-zinc-500 block mb-2">Chave de acesso</label>
                                <div className="relative">
                                    <iconify-icon icon="solar:lock-password-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-lg"></iconify-icon>
                                    <input 
                                        type={showPassword ? "text" : "password"} 
                                        value={password}
                                        onChange={handlePasswordChange}
                                        placeholder="••••••••••••" 
                                        required
                                        className={`w-full bg-black border ${passwordError ? 'border-red-500 focus:border-red-500' : 'border-zinc-800 focus:border-yellow-400'} text-white text-sm px-10 py-4 rounded-none focus:outline-none focus:shadow-[0_0_10px_rgba(250,204,21,0.2)] transition-colors placeholder:text-zinc-700 font-mono tracking-widest`}
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white transition-colors flex items-center justify-center p-1"
                                    >
                                        <iconify-icon icon={showPassword ? "solar:eye-closed-linear" : "solar:eye-linear"} className="text-lg"></iconify-icon>
                                    </button>
                                </div>
                                {passwordError && <p className="text-red-400 text-xs font-mono mt-2">{passwordError}</p>}
                            </div>

                            <div className="text-right">
                                <a href="#" className="text-zinc-500 hover:text-yellow-400 font-mono text-xs uppercase tracking-widest transition-colors">Esqueci minha senha</a>
                            </div>

                            {/* Botão Submit */}
                            <button 
                                type="submit" 
                                disabled={loading}
                                className="mt-4 w-full bg-yellow-400 text-black text-sm font-bold uppercase tracking-widest px-8 py-5 border border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)] hover:shadow-[0_0_25px_rgba(250,204,21,0.5)] disabled:opacity-50 disabled:shadow-none disabled:hover:shadow-none disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 rounded-none"
                            >
                                <span>{loading ? 'Autenticando' : 'Iniciar sessão'}</span>
                                <iconify-icon icon={loading ? "solar:spinner-linear" : "solar:arrow-right-linear"} className={loading ? "animate-spin" : ""} width="20"></iconify-icon>
                            </button>
                        </form>

                        {/* Rodapé */}
                        <div className="mt-12 pt-6 border-t border-zinc-800 sys-reveal sys-delay-200">
                            <p className="text-zinc-600 font-mono text-[10px] uppercase tracking-widest">Acesso restrito a usuários autorizados</p>
                        </div>
                    </div>
                </div>

                {/* Coluna Direita 40% */}
                <div className="hidden md:flex w-[40%] bg-zinc-950 border-l border-zinc-800 p-12 flex-col justify-between relative overflow-hidden group">
                    
                    {/* Grid Fundo Exclusivo */}
                    <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none"></div>

                    {/* Cam Live */}
                    <div className="flex justify-between items-start relative z-10 w-full sys-reveal">
                        <div className="bg-black border border-yellow-400/30 px-3 py-1 font-mono text-[10px] text-yellow-400 sys-flicker-anim shadow-[0_0_10px_rgba(250,204,21,0.2)]">
                            CAM_LIVE [01]
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
                        <iconify-icon icon="solar:buildings-2-linear" width="120" className="text-zinc-800"></iconify-icon>
                    </div>

                    {/* Dados Técnicos */}
                    <div className="relative z-10 font-mono text-[10px] text-zinc-500 text-right w-full mt-auto sys-reveal">
                        SYS_STATUS: <span className="text-yellow-400 font-bold">ONLINE</span><br/>
                        ACCESS_LEVEL: <span className="text-yellow-400 font-bold">RESTRICTED</span>
                    </div>
                </div>

            </main>
        </div>
    );
}
