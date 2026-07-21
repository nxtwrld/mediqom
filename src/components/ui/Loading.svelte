<script lang="ts">
  interface Props {
    type?: 'line' | 'big' | 'small';
    children?: import('svelte').Snippet;
  }

  let { type = 'big', children }: Props = $props();
</script>

<div class="loader-container -{type}">

    <div class="loader"></div>
    {@render children?.()}
</div>



<style>
.loader-container {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    height: 100%;
    width: 100%;
    min-width: 5rem;
    min-height: 5rem;
}  

.loader-container.-big {
    min-width: 10rem;
    min-height: 10rem;
    min-width: 5rem;
    min-height: 5rem;
}


.-big .loader {
  width: 1.5rem;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--color-interactivity);
  display: grid;
  animation: l22-0 2s infinite linear;
  margin-bottom: 3rem;

}
.-big .loader:before,
.-big .loader:after {
  content: "";
  grid-area: 1/1;
  margin: 15%;
  border-radius: 50%;
  background: var(--color-negative);
  transform: rotate(0deg) translate(150%);
  animation: l22 1s infinite;
}
.-big .loader:after {
  animation-delay: -.5s
}
@keyframes l22-0 {
  100% {transform: rotate(1turn)}
}
@keyframes l22 {
  100% {transform: rotate(1turn) translate(150%)}
}



.-line  .loader {
  width: 4rem;
  aspect-ratio: 4;
  --_g: no-repeat radial-gradient(circle closest-side,var(--color-interactivity) 90%,var(--color-interactivity));
  background: 
    var(--_g) 0%   50%,
    var(--_g) 50%  50%,
    var(--_g) 100% 50%;
  background-size: calc(100%/3) 100%;
  animation: l7 1s infinite linear;
}
@keyframes l7 {
    33%{background-size:calc(100%/3) 0%  ,calc(100%/3) 100%,calc(100%/3) 100%}
    50%{background-size:calc(100%/3) 100%,calc(100%/3) 0%  ,calc(100%/3) 100%}
    66%{background-size:calc(100%/3) 100%,calc(100%/3) 100%,calc(100%/3) 0%  }
}

</style>