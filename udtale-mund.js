// Mundbilleder til udtale-træneren: munden set forfra (som i et spejl) ved j, blødt d og l.
// Billederne er illustrationer uden tekst; al tekst står her, i almindeligt sprog.
// Kører i browseren (global UDTALE_MUND) og i Node (test-udtale.js tester data).
(function (root) {
  var MOUTHS = {
    j: {
      label: 'J', word: 'maj', img: 'images/udtale/mund-j.webp',
      text: 'Midten af tungen løfter sig højt op mod ganen.'
    },
    d: {
      label: 'Blødt d', word: 'mad', img: 'images/udtale/mund-d.webp',
      text: 'Tungen er bred og løfter sig op lige bag overtænderne, uden at røre dem. Tungespidsen er gemt bag undertænderne.'
    },
    l: {
      label: 'L', word: 'mal', img: 'images/udtale/mund-l.webp',
      text: 'Tungespidsen er oppe bag overtænderne, så man ser tungens underside.'
    }
  };
  var ORDER = ['j', 'd', 'l'];

  // Bygger billedvælgeren i et element. initial: 'j' | 'd' | 'l'. onPlay(word) afspiller eksempelordet.
  function mount(container, initial, onPlay) {
    var cur = MOUTHS[initial] ? initial : 'd';
    var timer = null;
    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'mund';

    var stage = document.createElement('div');
    stage.className = 'mund-stage';
    var imgs = {};
    ORDER.forEach(function (id) {
      var img = document.createElement('img');
      img.src = MOUTHS[id].img;
      img.alt = 'Munden set forfra ved ' + MOUTHS[id].label.toLowerCase();
      stage.appendChild(img);
      imgs[id] = img;
    });
    wrap.appendChild(stage);

    var btns = document.createElement('div');
    btns.className = 'mund-btns';
    var buttons = {};
    ORDER.forEach(function (id) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = MOUTHS[id].label;
      b.addEventListener('click', function () { stopDemo(); show(id); });
      btns.appendChild(b);
      buttons[id] = b;
    });
    var demo = document.createElement('button');
    demo.type = 'button'; demo.className = 'chip'; demo.textContent = '▶ Vis skiftet';
    demo.addEventListener('click', function () {
      stopDemo();
      show('j');
      timer = setTimeout(function () { show('d'); timer = null; }, 1400);
    });
    btns.appendChild(demo);
    wrap.appendChild(btns);

    var wordRow = document.createElement('p');
    wordRow.className = 'mund-word';
    var wordText = document.createElement('span');
    var hear = document.createElement('button');
    hear.type = 'button'; hear.className = 'chip'; hear.textContent = '▶ Hør ordet';
    hear.addEventListener('click', function () { if (onPlay) onPlay(MOUTHS[cur].word); });
    wordRow.appendChild(wordText);
    wordRow.appendChild(hear);
    wrap.appendChild(wordRow);

    var text = document.createElement('p');
    text.className = 'note mund-text';
    wrap.appendChild(text);
    container.appendChild(wrap);

    function stopDemo() { if (timer) { clearTimeout(timer); timer = null; } }
    function show(id) {
      cur = id;
      ORDER.forEach(function (k) {
        imgs[k].classList.toggle('active', k === id);
        buttons[k].classList.toggle('active', k === id);
      });
      wordText.textContent = MOUTHS[id].label + ', som i "' + MOUTHS[id].word + '" ';
      text.textContent = MOUTHS[id].text;
    }
    show(cur);
    return { show: show };
  }

  var api = { MOUTHS: MOUTHS, ORDER: ORDER, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UDTALE_MUND = api;
})(typeof window !== 'undefined' ? window : this);
