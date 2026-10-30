<script lang="ts">
    interface Props {
        open?: boolean;
    }

    let { open = false }: Props = $props();
</script>


<div class="menu-burger" class:open={open}>
    <div class="menu-burger__line"></div>
    <div class="menu-burger__line"></div>
    <div class="menu-burger__line"></div>
</div>

<style>
    .menu-burger {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-around;
        width: 100%;
        height: 100%;
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0;
        z-index: 10;
    }

    .menu-burger__line {
        position: absolute;
        width: 100%;
        height: 0.4rem;
        left: 50%;
        top: 50%;
        border-radius: 1rem;
        background: #000;
        transition: all .5s;
        transform: translate(-50%, -50%);
        transform-origin: 0 0;
    }
    .menu-burger__line:nth-child(1) {
        transform: translate(-50%, -250%);
    }
    .menu-burger__line:nth-child(2) {
        transform: translate(-50%, -50%);
    }
    .menu-burger__line:nth-child(3) {
        transform: translate(-50%, 150%);
    }

    .menu-burger.open .menu-burger__line:nth-child(1) {
        transform: rotate(-45deg) translate(-50%, -50%);
    }

    .menu-burger.open .menu-burger__line:nth-child(2) {
        opacity: 0;
    }

    .menu-burger.open .menu-burger__line:nth-child(3) {

        transform: rotate(45deg) translate(-50%, -50%);
    }
</style>