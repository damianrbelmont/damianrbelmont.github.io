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