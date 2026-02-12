<script lang="ts">
    import { run } from 'svelte/legacy';

    import { type Profile } from '$lib/types.d';
    import { profiles } from '$lib/profiles';
    import shortcuts from '$lib/shortcuts';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import user from '$lib/user';
    import { searchOptimize } from '$lib/strings';
    import { t } from '$lib/i18n';
    
    type Command = {
        command: string;
        translation?: string;
        path?: string;
        action?: () => void;
    }

    let baseCommands: Command[] = [
        {
            command: 'view',
            translation: $t('app.search.commands.view-profile'),
            path: '/med/p/[UID]/'
        },

        {
            command: 'documents',
            translation: $t('app.search.commands.view-documents'),
            path: '/med/p/[UID]/documents'
        },
        {
            command: 'history',
            translation: $t('app.search.commands.view-history'),
            path: '/med/p/[UID]/history'
        }
    ];

    let commands: Command[] = $derived.by(() => {
        const cmds = [...baseCommands];
        if ($user && 'isMedical' in $user && $user.isMedical) {
            cmds.push({
                command: 'session',
                translation: $t('app.search.commands.start-an-interview-session'),
                path: '/med/p/[UID]/session'
            });
        }
        return cmds;
    });

    let systemCommands: Command[] = [
        {
            command: 'profiles',
            translation: $t('app.nav.profiles'),
            path: '/med/p'
        },
        {
            command: 'logout',
            translation: $t('app.nav.logout'),
            action: () => {
                user.logout();
                goto('/auth');
            }
        },
        {
            command: 'import',
            translation: $t('app.search.commands.import-files'),
            path: '/med/import'
        }
    ]
   
    
    let results: (Profile | Command)[] = $state([]);
    let inputValue: string = $state('');
    let inputElement: HTMLInputElement | undefined = $state();
    
    // Type guards
    function isProfile(item: Profile | Command): item is Profile {
        return 'id' in item && 'fullName' in item;
    }
    
    function isCommand(item: Profile | Command): item is Command {
        return 'action' in item || 'path' in item || 'translation' in item || 'command' in item;
    }
    
    let selectedResult: number = $state(-1);
    let selectedCommand: number = $state(-1);


    function search (str: string = '') {

        selectedResult = -1;
        selectedCommand = -1;
        if (str === '') {
            results = [];
            return;
        }
        results = [
            ...$profiles.filter((p: Profile) => {
                const isInName = (p.fullName) ? searchOptimize(p.fullName).includes(searchOptimize(str)) : false;
                return isInName;
            }),
            ...systemCommands.filter((c) => {
                let isInCommnad = c.command.toLowerCase().includes(str.toLowerCase())
                let isInTranslation = c.translation ? searchOptimize(c.translation).includes(searchOptimize(str)) : false;
                return isInCommnad || isInTranslation;
            })

        ];



        if (results.length > 0) {
            selectedResult = 0;
        }

    }
    interface Props {
        isSearchOpen?: boolean;
    }

    let { isSearchOpen = $bindable(false) }: Props = $props();
    let blurTimer: ReturnType<typeof setTimeout>;

    function showSearch() {
        isSearchOpen = true;
        setTimeout(() => inputElement?.focus(), 100);

    }   
    function hideSearch() {
        isSearchOpen = false;
        inputElement?.blur();
        inputValue = '';
        results = [];
        selectedCommand = -1;
        selectedResult = -1;
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (e.code === 'Escape') {
            hideSearch();
        }
        if (e.code === 'Tab') {
            pressTab();
            return false;
        }
        if (e.code === 'ArrowDown') {
            selectedResult++;
            pressTab();
        }
        if (e.code === 'ArrowUp') {
            selectedResult--;
            pressTab();
        }
        if (e.code === 'Enter') {
            if (results[selectedResult]) {
                const selectedItem = results[selectedResult];
                
                if (isCommand(selectedItem)) {
                    if ('action' in selectedItem && selectedItem.action) {
                        selectedItem.action();
                        hideSearch();
                        return;
                    }
                    if ('path' in selectedItem && selectedItem.path) {
                        goto(selectedItem.path);
                        hideSearch();
                        return;
                    }
                }
                
                if (isProfile(selectedItem)) {
                    if (selectedCommand === -1) selectedCommand = 0;
                    const command = commands[selectedCommand];
                    if (command && command.path) {
                        goto(command.path.replace('[UID]', selectedItem.id));
                    }
                    hideSearch();
                }
            }
        }
    }

    function pressTab () {
        if (inputElement) {
            inputElement.focus();
            if (results[selectedResult]) {
                const selectedItem = results[selectedResult];
                
                if (isProfile(selectedItem)) {
                    inputValue = selectedItem.fullName;
                    // place caret at the end of the input
                    setTimeout(() => {
                        if (selectedCommand + 1 <= commands.length -1) selectedCommand++;
                        else selectedCommand = 0;
                        focusInput();
                    }, 10);
                } else if (isCommand(selectedItem)) {
                    inputValue = selectedItem.translation || selectedItem.command || '';
                    // place caret at the end of the input
                    setTimeout(() => {
                        selectedCommand = -1;
                        focusInput();
                    }, 10);
                }
            }
        }
    }


    function focusInput() {
        if (inputElement) {
            inputElement.focus();
            inputElement.setSelectionRange(inputValue.length, inputValue.length);
        }
        console.log(selectedCommand);
    }

    function blurredInput() {
        blurTimer = setTimeout(() => {
            hideSearch();
        }, 200);
    }

    function focusedInput() {
        clearTimeout(blurTimer);
    }

    onMount(() => {

        const off = [
            shortcuts.listen('find', showSearch),
            shortcuts.listen('KeyF', showSearch),
            shortcuts.listen('Escape', hideSearch)
        ]

        return () => {
            off.forEach(f => f());
        }
    });
    $effect(() => {
        search(inputValue);
    });
</script>

<div class="search-panel" class:-open={isSearchOpen }>
    <div class="search-input-box">
        <div class="hint">
            <span class="value">{inputValue}</span>
            {#if commands[selectedCommand]}
                <span class="command">&nbsp; &gt;&gt; {commands[selectedCommand].translation}</span>
            {/if}
        </div>
        <input type="search"
            placeholder={$t('app.search.search-profiles')}
            bind:this={inputElement} 
            bind:value={inputValue} 
            onblur={blurredInput}
            onfocus={focusedInput}
            onkeydown={handleKeyDown} />
        <input type="text" class="secondary"/>
    </div>
    {#if results.length == 0 && inputValue.length > 0}
        <div class="search-results-empty">
                <div>{ $t('app.search.no-results') }</div>
        </div>
    {:else if results.length > 0}
    <div class="search-results">
        {#each results as result, i}
            <div class="search-result" class:-selected={i === selectedResult}>
                {#if isProfile(result)}
                    <div class="search-result-name">{result.fullName}</div>
                    <div class="search-result-id">{result.id}</div>
                {:else if isCommand(result)}
                 <div class="search-result-name">{result.translation || result.command || ''}</div>
                {/if}
            </div>
        {/each}
    </div> 
    {/if}




</div>


<style>
    .search-panel {
        position: fixed;
        left: 0;
        bottom: 0;
        width: 100%;
        z-index: 100000;
        display: flex;
        flex-direction: column;
        align-items: center;
        max-height: 0;
        transition: max-height .3s, box-shadow .6s;
        overflow: hidden;
        box-shadow: 0 0 0 0 var(--color-black);
    }
    @media (min-width: 768px) { 
        .search-panel {
            top: 0;
            bottom: auto;
        }
    }
    .search-panel.-open {

        max-height: 100%;
        box-shadow: 0 2rem 2rem -1rem var(--color-black);
    }
    .search-input-box {
        position: relative;
        width: 100%;
        display: flex;
        justify-content: center;
        background-color: var(--color-white);
        height: var(--toolbar-height);
        overflow: hidden;
    }
    .search-input-box input {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        padding: .5rem;
        font-size: 1.5rem;
        background-color: transparent;
        outline: 0;
        border: none;
    }
    .search-input-box .hint {
        align-items: center;
        display: flex !important;
        unicode-bidi: normal;
        width: 100%;
        height: 100%;
        padding: .5rem;
        font-size: 1.5rem;
    }
    .search-input-box .hint .value {
        color: transparent;
    }
    .search-input-box .hint .command {
        color: var(--color-interactivity);
        font-weight: 700;
    }

    .search-input-box input.secondary {
        position: absolute;
        left: 100%;
        top: 0;
    }
    .search-results-empty {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 25vh;
        background-color: var(--color-gray-300);
        font-size: 2rem;
    }
    .search-results {
        display: flex;
        flex-direction: column;
        gap: .5rem;
        width: 100%;
        background-color: var(--color-gray-300);
    }

    .search-result {
        display: flex;
        justify-content: space-between;
        padding: 1rem;
        background-color: var(--color-gray-200);
        cursor: pointer;
    }
    .search-result.-selected {
        background-color: var(--color-interactivity);
        color: var(--color-interactivity-text);
    }
</style>