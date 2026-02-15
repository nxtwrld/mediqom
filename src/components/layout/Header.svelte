<!-- @migration-task Error while migrating Svelte code: Cannot subscribe to stores that are not declared at the top level of the component
https://svelte.dev/e/store_invalid_scoped_subscription -->
<script lang="ts">
    import { profile, profiles } from "$lib/profiles";
    import { page } from "$app/stores";
    import { emit } from "$lib/shortcuts";
    import user from "$lib/user";
    import Search from "./Search.svelte";
    import { goto } from "$app/navigation";
    import MenuBurger from "$components/ui/MenuBurger.svelte";
    import ui from "$lib/ui";
    import { state as uiState, Overlay } from "$lib/ui";
    import { t } from "$lib/i18n";
    import ProfileImage from "$components/profile/ProfileImage.svelte";
    import type { Profile } from "$lib/types.d";
    import { isOpen as chatIsOpen } from '$lib/chat/store';
    import SessionHeaderButton from '$components/session/SessionHeaderButton.svelte';

    function isActive(path: string, currentPath: string) {
        if ($uiState.overlay !== Overlay.none) return false;
        return currentPath.startsWith(path);
    }

    async function logout () {
        await user.logout();
        goto('/auth?redirect=/med');
    }

    enum Menu {
        'user',
        'tools',
        'none'
    }


    let isSearchOpen = $state(false);
    let activeMenu = $state(Menu.none);

    $effect(() => {
        if (isSearchOpen) {
            activeMenu = Menu.none;
        }
    });
    function toggleMenu(menu: Menu) {
        if (activeMenu == menu) {
            activeMenu = Menu.none;
        } else {
            activeMenu = menu;
        }
    }


</script>

<svelte:window on:click={() => {
    activeMenu = Menu.none;
}} />

<header>
    <nav class="toolbar">
        <a href="/med" class="icon logo">
            <svg>
                <use href="/logo.svg#icon"></use>
            </svg>
            <h1>{$t('app.name')}</h1>
        </a>
        <div class="navigation-mobile toolbar">
            <div class="spacer"></div>
            <button class="mobile-menu" onclick={(e) => { e.stopPropagation(); toggleMenu(Menu.tools); }}><MenuBurger open={activeMenu == Menu.tools} /></button>
        </div>
        
        <div class="navigation toolbar" class:-open={activeMenu == Menu.tools}>
            {#if $user}
            <div class="menu icon user-menu" class:-open={activeMenu == Menu.user}>
                <button onclick={(e) => { e.stopPropagation(); toggleMenu(Menu.user); }}>
                  <ProfileImage profile={$user.id ? (() => {
                    try {
                      return profiles.get($user.id) as Profile;
                    } catch {
                      return null;
                    }
                  })() : null} size={2} />
                </button>
                <ul class="menu">
                    <li>
                        <div class="user">
                            <h3 class="h3">{'fullName' in $user ? $user.fullName : $user.email}</h3>
    
                        </div>
                    </li>
                    <li><a href="/med/settings">{ $t('app.nav.settings') }</a></li>
                    <li><button onclick={logout}>{ $t('app.nav.logout') }</button></li>
                </ul>
            </div>
            {/if}
            
            {#if $user && 'subscription' in $user && $user.subscription != 'individual'}
                <a href="/med/p/" class:-active={$page.url.pathname == '/med/p/'}>{ $t('app.nav.profiles') }</a>
            {/if}

            {#if $profile}
                {#if $profile.id}
                    <a class="profile" href="/med/p/{$profile.id}" class:-active={isActive('/med/p/' +$profile.id , $page.url.pathname)}>
                        {#if $profile.avatarUrl}
                        <div class="icon profile-image">
                            <img src="/v1/med/profiles/{$profile.id}/avatar?path={$profile.avatarUrl}" loading="lazy" alt="avatar" />
                        </div>
                        {/if}
                        {$profile.fullName}
                    </a>
                    <!--div class="spacer"></div-->
                    <a href="/med/p/{$profile.id}/documents" class="sub-item" class:-active={isActive('/med/p/' +$profile.id + '/documents/', $page.url.pathname)}>{ $t('app.nav.documents') }</a>
                    <!--a href="/med/p/{$profile.id}/history" class="sub-item" class:-active={isActive('/med/p/' +$profile.id + '/history/', $page.url.pathname)}>{ $t('app.nav.history') }</a-->
                    {#if $user && 'isMedical' in $user && $user.isMedical}
                        <SessionHeaderButton 
                            profileId={$profile.id}
                            patientId={$profile.id}
                            performerId={$user.id}
                            performerName={$user.fullName || $user.email}
                            isActive={isActive('/med/p/' + $profile.id + '/session-moe', $page.url.pathname)}
                        />
                    {/if}
                {:else}
                    <div class="profile" class:-active={$page.url.pathname == '/med/p/addprofile/'}>{'fullName' in $profile ? $profile.fullName : 'New Profile'}</div>
                    <div class="spacer"></div>
                {/if}
            {:else}
                <div class="spacer"></div>
                {#if $user && 'subscription' in $user && $user.subscription != 'individual'}
                <a href="/med/p/addprofile/">{ $t('app.nav.add-profile') }</a>
                {/if}
            {/if}
            <!--a href="/med/import" class:-active={$page.url.pathname == '/med/import/'}>Import</a-->
            <button onclick={() => ui.emit('overlay.import')} class:-active={$uiState.overlay == Overlay.import}>{ $t('app.nav.import') }</button>
        </div>
        <button onclick={() => emit('find')} class="icon" aria-label="Search"><svg >
            <use href="/icons.svg#search"></use>
        </svg></button>

        {#if $profile?.id}
        <button onclick={() => ui.emit('chat:toggle')} class="icon" class:-active={$chatIsOpen} aria-label={$chatIsOpen ? $t('app.chat.actions.close') : $t('app.chat.actions.open')} title={$chatIsOpen ? $t('app.chat.actions.close') : $t('app.chat.actions.open')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <use href="/icons.svg#doctor"/>
            </svg>
        </button>
        {/if}

</nav>
</header>


<Search bind:isSearchOpen={isSearchOpen} />
<style>
    header {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        /*padding-top: var(--safe-area-top);*/
        height: var(--toolbar-height);
        z-index: 1000;
        --menu-shadow: 0 1rem 1rem -.5rem var(--color-gray-800);
    }
    @media (min-width: 768px) { 
        header,
        .search-panel {
            top: 0;
            bottom: auto;
        }
    }
    header .toolbar {
        --button-color: var(--color-gray-500-alpha);
    }

    .icon {
        width: var(--toolbar-height);
        padding: .5rem;
    }
    .icon.logo {
        padding: 0;
    }
    .logo h1 {
        display: none;
    }

    .icon svg {
        width: 100%;
        height: 100%;
        fill: currentColor;
        color: var(--color-black);
    }
    
    .icon.-active {
        background-color: var(--color-interactivity);
        color: var(--color-white);
        fill: currentColor;
    }
    .icon img {
        position: relative;
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
        border: 1px solid var(--color-gray-800);
    }


    .profile {
        flex-grow: 1;
    }
    .profile.-active {
        color: var(--color-black);
        font-weight: bold;
        border-color: var(--button-color);
        border-bottom-width: 2px;
    }
/*
    .toolbar *:first-child {

        border-top-left-radius: var(--radius);
        border-bottom-left-radius: var(--radius);
        padding-left: calc(var(--radius) / 1.5);
    }
    .toolbar *:last-child {
        border-top-right-radius: var(--radius);
        border-bottom-right-radius: var(--radius);
        padding-right: calc(var(--radius) / 1.5);
    }
*/

    .menu {
        position: relative;
    }
    .menu button {
        background-color: transparent;
        border: none;
        padding: 0;
        margin: 0;
    }
   

    .menu > ul.menu {
        position: absolute;
        top: calc(100% + var(--gap));
        left: 0;
        max-height: 0;
        min-width: 10rem;
        background-color: var(--color-gray-500);
        border-radius: var(--radius);
        box-shadow: var(--menu-shadow);
        transition: max-height .5s;
        overflow: hidden;
    }
    .menu.-open {
        background-color: var(--color-white);
    }
    .menu.-open > ul.menu {
        max-height: 100vh;
    }
   
    .menu > ul.menu li {
    
        margin-top: var(--gap);
    }

    .menu > ul.menu li button,
    .menu > ul.menu li a {
        background-color: var(--color-gray-300);
        border: none;
        padding: .5rem;
        width: 100%;
        margin: 0;
        text-align: left;
        display: block;
        text-decoration: none;
        color: inherit;
    }
    .menu > ul.menu li button:hover,
    .menu > ul.menu li a:hover {
        background-color: var(--color-white);
    }


    .user {
        display: flex;
        flex-direction: column;
        gap: .5rem;
        padding: .5rem;
    }
    .user .h3 {
        white-space: nowrap;
    }



    .toolbar > .navigation-mobile {
            display: none;
    }

    .mobile-menu {
        padding: .6rem;
    }
    @media screen and (max-width: 768px) {
        .toolbar .navigation-mobile {
            display: flex;
        }
        .toolbar > .navigation {
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            align-items: stretch;
            position: fixed;
            width: 100%;
            height: calc(100vh - var(--toolbar-height));
            /*top: var(--toolbar-height);*/
            background-color: var(--color-gray-500);
            padding-top: var(--gap);
            max-height: 0;
            overflow: hidden;
            transition: max-height .5s;
        }
        .toolbar > .navigation.-open {
            max-height: calc(100vh - var(--toolbar-height));
            box-shadow: var(--menu-shadow);

        }
        .toolbar > .navigation .spacer {
            display: none;
        }
        .toolbar > .navigation > a {
            display: block;
            padding: 1rem;
            margin-bottom: var(--gap);
            flex-grow: 0;
        }
        .toolbar > .navigation > a.sub-item {
            padding-left: 2rem;
        }
        .toolbar > .navigation > a.-active {
            background-color: var(--color-white);
            border-bottom-color: var(--color-interactivity);
        }

        .menu > ul.menu {
            position: fixed;
            top: var(--toolbar-height);
            left: 0;
            width: 100%;
            height: calc(100vh - var(--toolbar-height));

        }

    }
</style>
