document.addEventListener('DOMContentLoaded', () => {

    /* =========================================
       1. FUNCIONALIDAD DEL MENÚ HAMBURGUESA
       (Específico para la página de Novelas)
    ========================================= */
    const menuToggle = document.querySelector('.menu-toggle');
    const mainNav = document.querySelector('.main-nav');

    if (menuToggle && mainNav) {
        menuToggle.addEventListener('click', () => {
            mainNav.classList.toggle('active');
            
            // Animación de las barras (X)
            const bars = menuToggle.querySelectorAll('.bar');
            if (mainNav.classList.contains('active')) {
                // Convertir en X
                bars[0].style.transform = "rotate(-45deg) translate(-5px, 6px)";
                bars[1].style.opacity = "0";
                bars[2].style.transform = "rotate(45deg) translate(-5px, -6px)";
            } else {
                // Volver a 3 rayas
                bars[0].style.transform = "none";
                bars[1].style.opacity = "1";
                bars[2].style.transform = "none";
            }
        });
    }

    /* =========================================
       2. MODAL DE POSEIDÓN
    ========================================= */
    const modal = document.getElementById("modal-poseidon");
    const trigger = document.getElementById("poseidon-trigger");
    const closeBtn = document.querySelector(".close-modal");

    if (modal && trigger && closeBtn) {
        
        // Abrir modal
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            modal.style.display = "block";
        });

        // Cerrar con la X
        closeBtn.addEventListener('click', () => {
            modal.style.display = "none";
        });

        // Cerrar clicando fuera
        window.addEventListener('click', (e) => {
            if (e.target == modal) {
                modal.style.display = "none";
            }
        });
    }
});