

// Handle parallax effect on scroll
window.addEventListener('scroll', function () {
    let scrollPosition = window.scrollY;

    // Control the background zoom effect
    document.querySelector('.parallex').style.backgroundSize = `${100 + scrollPosition * 0.09}%`;

    // Move elements based on scroll
    document.querySelector('#main-text').style.transform = `translateY(${scrollPosition * 0.1}px)`;
    document.querySelector('#right-tree').style.transform = `translateX(${scrollPosition * 0.4}px)`;
    document.querySelector('#top-left').style.transform = `translateX(${scrollPosition * -0.4}px)`;
    document.querySelector('#right-down-stone').style.transform = `translateX(${scrollPosition * 0.5}px)`;
    document.querySelector('#right-down-leaf').style.transform = `translateX(${scrollPosition * 0.4}px)`;
    document.querySelector('#left-down-leaf').style.transform = `translateX(${scrollPosition * -0.2}px)`;
});

