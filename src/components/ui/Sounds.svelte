<script lang="ts" module>

    export const sounds : {
        [soundName: string]: {
            play: () => void;
        }
    } = {};

    export const play = (soundName: string) => {
        sounds[soundName]?.play();
    }

</script>
<script lang="ts">
    import { onMount } from 'svelte';
    import {Howl, Howler} from 'howler';


    let soundSprite: Howl;


    const sprite: {
        [soundName: string]: [number, number];
    } = {
        xp: [0, 3000],
        model: [3000, 3000],
        focus: [6000, 3000],
        accept: [9000, 3000]
    }
    // Gestures that satisfy the browser autoplay policy. touchstart/pointerdown
    // matter on mobile, where mousedown is synthesized late or not at all.
    const UNLOCK_EVENTS = ['mousedown', 'keydown', 'touchstart', 'pointerdown'] as const;

    function enableSoundEffects() {
        Howler.volume(0.3);
        (Howler as any).mobileAutoEnable = true;
        
        soundSprite = new Howl({
            src: ["/sounds/sprite.mp3"],
            volume: 0.5,
            sprite: {
                focus: [0, 1000],
                import: [0, 1000],
                accept: [1000, 1000],
                model: [2000, 2000],
                xp: [4000, 2000]
            }
        });
        for (let soundName in sprite) {
            sounds[soundName] = {
                play : () => {
                    //if ($state.soundEffects) {
                        soundSprite.play(soundName);
                    //}

                }
            }
        }
        (sounds as any).play = (soundName: string) => {
            soundSprite.play(soundName);
        }


        for (const event of UNLOCK_EVENTS) {
            window.removeEventListener(event, enableSoundEffects, true);
        }
    };

    onMount(() => {
        console.log('Sounds mounted');

        // Capture phase: label and cluster-badge handlers call stopPropagation()
        // on mousedown, so a bubble-phase listener never sees the first gesture
        // and audio stays locked. Capture runs before any target handler.
        for (const event of UNLOCK_EVENTS) {
            window.addEventListener(event, enableSoundEffects, true);
        }

        return () => {
            for (const event of UNLOCK_EVENTS) {
                window.removeEventListener(event, enableSoundEffects, true);
            }
        };
    });


</script>


