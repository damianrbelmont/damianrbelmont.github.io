document.addEventListener('DOMContentLoaded', () => {
            const menuToggle = document.querySelector('.menu-toggle');
            const menuClose = document.querySelector('.menu-close');
            const mobileNav = document.getElementById('mobileNav');
            const navLinks = document.querySelectorAll('.nav-link');

            // Abrir menú
            menuToggle.addEventListener('click', () => {
                mobileNav.classList.add('active');
                document.body.style.overflow = 'hidden'; // Evitar scroll de fondo
            });

            // Cerrar menú
            const closeMenu = () => {
                mobileNav.classList.remove('active');
                document.body.style.overflow = '';
            };

            menuClose.addEventListener('click', closeMenu);

            // Cerrar al hacer clic en un enlace
            navLinks.forEach(link => {
                link.addEventListener('click', closeMenu);
            });
        });