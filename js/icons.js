// SVG Icon Sprite Loader
// Loads /images/icons.svg and injects it into the page
(function() {
  fetch('/images/icons.svg')
    .then(function(r) { return r.text(); })
    .then(function(svg) {
      var div = document.createElement('div');
      div.style.display = 'none';
      div.innerHTML = svg;
      document.body.insertBefore(div, document.body.firstChild);
    })
    .catch(function() {});
})();
