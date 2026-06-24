export function registerServiceWorker() {
  // Service Worker desabilitado por enquanto — tanto em dev quanto em produção.
  // Além de não registrar, DESREGISTRA ativamente qualquer instância já instalada
  // nos clientes (o SW é persistente e continuaria servindo cache antigo até ser
  // removido). Reabilitar o registro abaixo quando a estratégia de cache do
  // sw.js estiver definida.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(registrations => registrations.forEach(registration => registration.unregister()))
      .catch(error => {
        console.log('SW unregister failed:', error);
      });
  }

  // Registro de produção — comentado por enquanto:
  // if ('serviceWorker' in navigator) {
  //   window.addEventListener('load', () => {
  //     navigator.serviceWorker
  //       .register('/sw.js')
  //       .then(registration => {
  //         console.log('SW registered:', registration);
  //       })
  //       .catch(error => {
  //         console.log('SW registration failed:', error);
  //       });
  //   });
  // }
}
