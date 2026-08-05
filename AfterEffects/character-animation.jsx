/**
 * Character Animation Script for After Effects
 * Кейіпкердің базалық қимылдарын жасайды
 * (walking, waving, idle)
 * 
 * Қолдану: After Effects → File → Scripts → Run Script File
 */

(function() {
    // ============ НӘТИЖЕЛЕР ============
    var SCRIPT_NAME = "Character Animator";
    var SCRIPT_VERSION = "1.0";
    
    // ============ ТІЛ ОРНАТУ ============
    var lang = {
        title: "Кейіпкер Аниматоры",
        selectImage: "Кейіпкер суретін таңдаңыз (PNG/JPG)",
        selectAnimation: "Анимация түрін таңдаңыз:",
        walking: "Жүру (Walking)",
        waving: "Қолмен сәлемдесу (Waving)",
        idle: "Демалу (Idle/Breathing)",
        allAnimations: "Барлық анимацияларды жасау",
        create: "Жасау",
        cancel: "Болдырмау",
        success: "Анимация сәтті жасалды!",
        error: "Қате орын алды: ",
        fps: "FPS:",
        duration: "Ұзақтылық (секунд):"
    };
    
    // ============ БӘСЕКЕЛІК АЛГОРИТМДЕР ============
    
    /**
     * Puppet Pin анимациясын жасайды
     * @param {Layer} layer - Слой
     * @param {Array} points - Тірек нүктелері [[x,y], ...]
     * @param {Array} keyframes - Кадрлар [[frame, [dx, dy]], ...]
     */
    function createPuppetAnimation(layer, points, keyframes) {
        var puppetEffect = layer.Effects.addProperty("ADBE Puppet");
        var meshIndex = 1;
        
        // Тірек нүктелерін қосу
        for (var i = 0; i < points.length; i++) {
            var pin = puppetEffect.property("ADBE Puppet Atom Pins");
            var pinProp = pin.addProperty("ADBE Puppet Pin Group");
            pinProp.property("ADBE Puppet Position").setValue(points[i]);
        }
        
        // Кілттік кадрларды қою
        for (var k = 0; k < keyframes.length; k++) {
            var frame = keyframes[k][0];
            var offset = keyframes[k][1];
            
            for (var p = 0; p < points.length; p++) {
                var pos = puppetEffect.property("ADBE Puppet Atom Pins")
                    .property("ADBE Puppet Pin Group")
                    .property("ADBE Puppet Position");
                
                var currentPos = pos.value;
                pos.setValueAtTime(frame / 24, [
                    currentPos[0] + offset[0],
                    currentPos[1] + offset[1]
                ]);
            }
        }
    }
    
    /**
     * Трансформация анимациясын жасайды
     * @param {Layer} layer - Слой
     * @param {String} property - Қасиет аты (position, rotation, scale)
     * @param {Array} keyframes - [[time, value], ...]
     * @param {String} easing - Езілу түрі (smooth, linear)
     */
    function createTransformAnimation(layer, property, keyframes, easing) {
        var prop = layer.property("Transform").property(property);
        
        if (!prop) {
            alert("Қате: " + property + " қасиеті табылмады");
            return;
        }
        
        for (var i = 0; i < keyframes.length; i++) {
            var time = keyframes[i][0];
            var value = keyframes[i][1];
            
            prop.setValueAtTime(time, value);
            
            // Езілу қою (easing)
            if (easing === "smooth" && i > 0 && i < keyframes.length - 1) {
                var keyIn = new KeyframeEase(0, 66.67);
                var keyOut = new KeyframeEase(0, 66.67);
                prop.setTemporalEaseAtTime(time, [keyIn], [keyOut]);
            }
        }
    }
    
    // ============ АНИМАЦИЯ ТҮРЛЕРІ ============
    
    /**
     * Жүру анимациясы
     * @param {Layer} layer - Кейіпкер слойы
     * @param {Number} duration - Ұзақтылық (секунд)
     */
    function createWalkingAnimation(layer, duration) {
        var fps = 24;
        var totalFrames = duration * fps;
        
        // Дененің жоғары-төмен қозғалысы (bobbing)
        var bobKeyframes = [];
        for (var f = 0; f <= totalFrames; f += fps / 4) {
            var bobAmount = Math.sin(f * 0.2) * 15;
            bobKeyframes.push([f / fps, [0, bobAmount]]);
        }
        createTransformAnimation(layer, "position", bobKeyframes, "smooth");
        
        // Бүгілу (slight rotation for walking feel)
        var rotKeyframes = [];
        for (var f = 0; f <= totalFrames; f += fps / 2) {
            var rotAmount = Math.sin(f * 0.15) * 3;
            rotKeyframes.push([f / fps, rotAmount]);
        }
        createTransformAnimation(layer, "rotation", rotKeyframes, "smooth");
        
        // Масштаб өзгерісі (perspective)
        var scaleKeyframes = [];
        for (var f = 0; f <= totalFrames; f += fps / 4) {
            var scaleX = 100 + Math.sin(f * 0.2) * 3;
            var scaleY = 100 + Math.cos(f * 0.2) * 2;
            scaleKeyframes.push([f / fps, [scaleX, scaleY]]);
        }
        createTransformAnimation(layer, "scale", scaleKeyframes, "smooth");
        
        return true;
    }
    
    /**
     * Қолмен сәлемдесу анимациясы
     * @param {Layer} layer - Кейіпкер слойы
     * @param {Number} duration - Ұзақтылық (секунд)
     */
    function createWavingAnimation(layer, duration) {
        var fps = 24;
        var totalFrames = duration * fps;
        
        // Қолдың қозғалысы (rotation + position)
        var waveKeyframes = [];
        var numWaves = Math.floor(duration / 1.5);
        
        for (var w = 0; w < numWaves; w++) {
            var startTime = w * 1.5;
            
            // Қолды көтеру
            waveKeyframes.push([startTime, 0]);
            waveKeyframes.push([startTime + 0.2, -25]);
            
            // Қолды қайыру (wave motion)
            for (var i = 0; i < 4; i++) {
                var t = startTime + 0.3 + (i * 0.15);
                var angle = (i % 2 === 0) ? -15 : -35;
                waveKeyframes.push([t, angle]);
            }
            
            // Қолды түсіру
            waveKeyframes.push([startTime + 1.2, -25]);
            waveKeyframes.push([startTime + 1.4, 0]);
        }
        
        createTransformAnimation(layer, "rotation", waveKeyframes, "smooth");
        
        // Дененің аздап қозғалысы
        var bodyKeyframes = [];
        for (var f = 0; f <= totalFrames; f += fps) {
            var bodyShift = Math.sin(f * 0.3) * 5;
            bodyKeyframes.push([f / fps, [bodyShift, 0]]);
        }
        createTransformAnimation(layer, "position", bodyKeyframes, "smooth");
        
        return true;
    }
    
    /**
     * Демалу анимациясы (idle breathing)
     * @param {Layer} layer - Кейіпкер слойы
     * @param {Number} duration - Ұзақтылық (секунд)
     */
    function createIdleAnimation(layer, duration) {
        var fps = 24;
        var totalFrames = duration * fps;
        
        // Дем алу (тыныс алу)
        var breathKeyframes = [];
        for (var f = 0; f <= totalFrames; f += fps / 3) {
            var breathScale = 100 + Math.sin(f * 0.1) * 2;
            breathKeyframes.push([f / fps, [breathScale, breathScale]]);
        }
        createTransformAnimation(layer, "scale", breathKeyframes, "smooth");
        
        // Аздап қозғалу (subtle movement)
        var swayKeyframes = [];
        for (var f = 0; f <= totalFrames; f += fps / 2) {
            var swayX = Math.sin(f * 0.08) * 3;
            var swayY = Math.cos(f * 0.06) * 2;
            swayKeyframes.push([f / fps, [swayX, swayY]]);
        }
        createTransformAnimation(layer, "position", swayKeyframes, "smooth");
        
        // Көз ишара (blink simulation via scale)
        var blinkKeyframes = [];
        for (var f = 0; f <= totalFrames; f += fps * 3 + Math.random() * fps * 2) {
            // Жыпы ету
            blinkKeyframes.push([f / fps, 100]);
            blinkKeyframes.push([f / fps + 0.05, 5]);
            blinkKeyframes.push([f / fps + 0.1, 100]);
        }
        createTransformAnimation(layer, "scale", blinkKeyframes, "linear");
        
        return true;
    }
    
    // ============ НЕГІЗГІ ФУНКЦИЯЛАР ============
    
    /**
     * Суретті импорттайды
     * @returns {Layer|null}
     */
    function importCharacterImage() {
        var file = File.openDialog("Кейіпкер суретін таңдаңыз", 
            "Суреттер:*.png;*.jpg;*.jpeg;*.psd;*.tiff");
        
        if (!file) return null;
        
        var importOpts = new ImportOptions(file);
        var importedFootage = app.project.importFile(importOpts);
        
        // Композиция жасау
        var comp = app.project.items.addComp(
            "Кейіпкер Анимациясы",
            1920, 1080, 1, 10, 24
        );
        
        // Суретті қосу
        var layer = comp.layers.add(importedFootage);
        
        // Суретті орталау
        layer.property("Transform").property("position").setValue([
            comp.width / 2,
            comp.height / 2
        ]);
        
        return { comp: comp, layer: layer };
    }
    
    /**
     * Параметрлер диалогын көрсетеді
     * @returns {Object|null}
     */
    function showSettingsDialog() {
        var dialog = new Window("dialog", SCRIPT_NAME + " v" + SCRIPT_VERSION);
        dialog.orientation = "column";
        dialog.alignChildren = ["fill", "top"];
        
        // FPS таңдау
        var fpsGroup = dialog.add("group");
        fpsGroup.add("statictext", undefined, lang.fps);
        var fpsDropdown = fpsGroup.add("dropdownlist", undefined, ["24", "30", "60"]);
        fpsDropdown.selection = 0;
        
        // Ұзақтылық
        var durGroup = dialog.add("group");
        durGroup.add("statictext", undefined, lang.duration);
        var durInput = durGroup.add("edittext", undefined, "5");
        durInput.characters = 5;
        
        // Батырмалар
        var btnGroup = dialog.add("group");
        btnGroup.add("button", undefined, lang.create, { name: "ok" });
        btnGroup.add("button", undefined, lang.cancel, { name: "cancel" });
        
        if (dialog.show() === 1) {
            return {
                fps: parseInt(fpsDropdown.selection.text),
                duration: parseFloat(durInput.text)
            };
        }
        return null;
    }
    
    /**
     * Анимация түрін таңдау диалогы
     * @returns {String|null}
     */
    function showAnimationDialog() {
        var dialog = new Window("dialog", lang.selectAnimation);
        dialog.orientation = "column";
        dialog.alignChildren = ["fill", "top"];
        
        var animType = null;
        
        var walkBtn = dialog.add("button", undefined, lang.walking);
        walkBtn.onClick = function() { animType = "walking"; dialog.close(1); };
        
        var waveBtn = dialog.add("button", undefined, lang.waving);
        waveBtn.onClick = function() { animType = "waving"; dialog.close(1); };
        
        var idleBtn = dialog.add("button", undefined, lang.idle);
        idleBtn.onClick = function() { animType = "idle"; dialog.close(1); };
        
        var allBtn = dialog.add("button", undefined, lang.allAnimations);
        allBtn.onClick = function() { animType = "all"; dialog.close(1); };
        
        if (dialog.show() === 1) {
            return animType;
        }
        return null;
    }
    
    // ============ НЕГІЗГІ ПРОЦЕСС ============
    
    function main() {
        app.beginUndoGroup(SCRIPT_NAME);
        
        try {
            // 1. Суретті импорттау
            var character = importCharacterImage();
            if (!character) {
                alert("Сурет таңдалмады.");
                return;
            }
            
            // 2. Параметрлерді алу
            var settings = showSettingsDialog();
            if (!settings) return;
            
            // 3. Анимация түрін таңдау
            var animType = showAnimationDialog();
            if (!animType) return;
            
            // 4. FPS орнату
            character.comp.frameDuration = 1 / settings.fps;
            
            // 5. Анимация жасау
            var created = [];
            
            if (animType === "walking" || animType === "all") {
                createWalkingAnimation(character.layer, settings.duration);
                created.push("walking");
            }
            
            if (animType === "waving" || animType === "all") {
                if (animType === "all") {
                    // Жаңа слой жасау
                    var waveLayer = character.comp.layers.add(
                        character.layer.source
                    );
                    waveLayer.property("Transform").property("position").setValue([
                        character.comp.width / 2,
                        character.comp.height / 2
                    ]);
                    createWavingAnimation(waveLayer, settings.duration);
                } else {
                    createWavingAnimation(character.layer, settings.duration);
                }
                created.push("waving");
            }
            
            if (animType === "idle" || animType === "all") {
                if (animType === "all") {
                    var idleLayer = character.comp.layers.add(
                        character.layer.source
                    );
                    idleLayer.property("Transform").property("position").setValue([
                        character.comp.width / 2,
                        character.comp.height / 2
                    ]);
                    createIdleAnimation(idleLayer, settings.duration);
                } else {
                    createIdleAnimation(character.layer, settings.duration);
                }
                created.push("idle");
            }
            
            // 6. Нәтиже
            alert("✅ " + lang.success + "\n\n" +
                  "Жасалған анимациялар: " + created.join(", ") + "\n" +
                  "Ұзақтылық: " + settings.duration + " секунд\n" +
                  "FPS: " + settings.fps);
            
        } catch (e) {
            alert(lang.error + e.toString());
        } finally {
            app.endUndoGroup();
        }
    }
    
    // ============ БАСТАУ ============
    main();
    
})();
