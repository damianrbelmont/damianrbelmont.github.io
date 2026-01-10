document.addEventListener('DOMContentLoaded', () => {

    /* =========================================
       1. MENÚ HAMBURGUESA
    ========================================= */
    const menuToggle = document.querySelector('.menu-toggle');
    const mobileNav = document.querySelector('.mobile-nav');
    const menuClose = document.querySelector('.menu-close');

    function toggleMenu() {
        mobileNav.classList.toggle('active');
        
        // Animación simple de las barras si se desea
        const bars = document.querySelectorAll('.bar');
        if (mobileNav.classList.contains('active')) {
            bars[0].style.transform = "rotate(-45deg) translate(-5px, 6px)";
            bars[1].style.opacity = "0";
            bars[2].style.transform = "rotate(45deg) translate(-5px, -6px)";
        } else {
            bars[0].style.transform = "none";
            bars[1].style.opacity = "1";
            bars[2].style.transform = "none";
        }
    }

    if (menuToggle && mobileNav) {
        menuToggle.addEventListener('click', toggleMenu);
    }

    if (menuClose) {
        menuClose.addEventListener('click', toggleMenu);
    }


    /* =========================================
       2. MODAL DE EXTRACTO
    ========================================= */
    const modal = document.getElementById('modal-extract');
    const triggerBtn = document.getElementById('extract-trigger');
    const closeX = document.querySelector('.close-modal');
    const closeBottom = document.querySelector('.close-modal-btn-bottom');

    function openModal() {
        if (modal) {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden'; // Evitar scroll de fondo
        }
    }

    function closeModal() {
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto'; // Restaurar scroll
        }
    }

    if (triggerBtn) {
        triggerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openModal();
        });
    }

    if (closeX) {
        closeX.addEventListener('click', closeModal);
    }

    if (closeBottom) {
        closeBottom.addEventListener('click', closeModal);
    }

    // Cerrar si se pulsa fuera (opcional, pero buena práctica)
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

});