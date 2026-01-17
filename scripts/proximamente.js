document.addEventListener('DOMContentLoaded', () => {
    
    /* =========================================
       LÓGICA DEL MENÚ MÓVIL
       ========================================= */
    const menuToggle = document.querySelector('.menu-toggle');
    const mobileNav = document.querySelector('.mobile-nav');
    const menuClose = document.querySelector('.menu-close');

    // Comprobamos que los elementos existan para evitar errores
    if (menuToggle && mobileNav && menuClose) {
        
        // 1. ABRIR MENÚ
        menuToggle.addEventListener('click', () => {
            mobileNav.classList.add('active');
            document.body.style.overflow = 'hidden'; // Evita que se haga scroll en el fondo
        });

        // 2. CERRAR MENÚ (Botón X)
        menuClose.addEventListener('click', () => {
            mobileNav.classList.remove('active');
            document.body.style.overflow = ''; // Reactiva el scroll
        });

        // 3. CERRAR MENÚ AL PULSAR UN ENLACE
        // (Útil para que el menú se esconda tras ir a una sección)
        const navLinks = mobileNav.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileNav.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
    }
});