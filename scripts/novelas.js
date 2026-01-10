document.addEventListener('DOMContentLoaded', () => {

    // --- MODAL POSEIDÓN ---
    const modal = document.getElementById("modal-poseidon");
    const trigger = document.getElementById("poseidon-trigger");
    const closeBtn = document.querySelector(".close-modal");

    // Solo ejecutamos si existen los elementos (seguridad extra)
    if (modal && trigger && closeBtn) {
        
        // Abrir modal al hacer click en el bloque de Poseidón
        trigger.addEventListener('click', (e) => {
            e.preventDefault(); // Evita scroll o recarga
            modal.style.display = "block";
        });

        // Cerrar al hacer click en la X
        closeBtn.addEventListener('click', () => {
            modal.style.display = "none";
        });

        // Cerrar si se hace click en el fondo oscuro (fuera del modal)
        window.addEventListener('click', (e) => {
            if (e.target == modal) {
                modal.style.display = "none";
            }
        });
    }
});