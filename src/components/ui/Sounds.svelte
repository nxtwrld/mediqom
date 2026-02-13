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


        console.log('sound effects enabled');
        window.removeEventListener('mousedown', enableSoundEffects);
        window.removeEventListener('keydown', enableSoundEffects);
    };

    onMount(() => {
        console.log('Sounds mounted');

        window.addEventListener('mousedown', enableSoundEffects);
        window.addEventListener('keydown', enableSoundEffects);
    });


</script>


