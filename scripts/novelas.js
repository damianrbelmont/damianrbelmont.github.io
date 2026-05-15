/* =========================================
   LÓGICA DE MODALES (Catálogo de Novelas)
   ========================================= */

// 1. FUNCIÓN PARA ABRIR EL MODAL
// Se llama desde el HTML con onclick="openModal('id-del-modal')"
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active'); // Muestra el modal (CSS display: flex)
        document.body.style.overflow = 'hidden'; // Bloquea el scroll de la web de fondo
    }
}

// 2. FUNCIÓN PARA CERRAR EL MODAL
// Se llama desde la "X" del HTML
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active'); // Oculta el modal
        document.body.style.overflow = ''; // Reactiva el scroll
    }
}

// 3. CERRAR AL HACER CLIC FUERA (EN EL FONDO OSCURO)
window.addEventListener('click', (event) => {
    // Si el elemento clickeado es el fondo oscuro (overlay)
    if (event.target.classList.contains('modal-overlay')) {
        event.target.classList.remove('active');
        document.body.style.overflow = ''; // Reactiva el scroll
    }
});

// 4. ACTIVADORES SEMANTICOS PARA MODALES
document.addEventListener('DOMContentLoaded', () => {
    const modalTriggers = document.querySelectorAll('.js-modal-trigger[data-modal-target]');
    const closeButtons = document.querySelectorAll('[data-modal-close]');

    modalTriggers.forEach((trigger) => {
        const targetId = trigger.getAttribute('data-modal-target');
        if (!targetId) return;

        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            openModal(targetId);
        });

        trigger.addEventListener('keydown', (event) => {
            if (event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                openModal(targetId);
            }
        });
    });

    closeButtons.forEach((button) => {
        const targetId = button.getAttribute('data-modal-close');
        if (!targetId) return;

        button.addEventListener('click', () => {
            closeModal(targetId);
        });
    });
});
