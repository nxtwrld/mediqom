<!-- @migration-task Error while migrating Svelte code: can't migrate `let loadedLayers: string[] = [];` to `$state` because there's a variable named state.
     Rename the variable and try again or migrate by hand. -->
<script lang="ts">
    import { goto } from '$app/navigation';
    import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
    import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
    import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
    import ui, { state } from '$lib/ui';
    import objects3d, { isObject } from '$lib/context/objects';
    import Label from '$components/documents/Label.svelte';
    import { fade } from 'svelte/transition';
    import TWEEN from '@tweenjs/tween.js';
    import { isTouchDevice  } from '$lib/device';
    import focused from '$lib/focused';
    import { profile } from '$lib/profiles';
    //import profile from '$lib/user/profile';
    //import type { Figure } from '$lib/user/profile';
    import type { Profile, SexEnum } from '$lib/types.d';
    import { groupByTags } from '$lib/documents/tools';
    //import reports from '$lib/report/store';
    import shaders from './shaders';
    import type { IContext } from './context/types.d';
    import contexts from './context/index';
	import store from './store';
	//import { linkPage } from '$lib/app';
    //import { addExperience } from '$lib/xp/store';
	import { sounds } from '$components/ui/Sounds.svelte';
    import { t } from '$lib/i18n';
	//import Error from '../../../routes/+error.svelte';

    const dispatch = createEventDispatcher();

    type ViewState = {
        position: THREE.Vector3;
        rotation: THREE.Euler;
        target: THREE.Vector3;
    }
    const DEFAULT_OPACITY = .9;
    const UNFOCUSED_OPACITY = .5;

/*

    console.log('🧍', 'Body', Object.entries(objects3d).reduce((acc, [k,v]) => {
        return [...acc, ...v.objects]
    }, [])).reduce((acc, o) => {
        return {...acc, [o]: o}
    }, {});
*/

    let FOCUS_COLOR = 0x16d3dd;
    let HIGHLIGHT_COLOR = 0xe9a642;
        
    //console.log('🧍', 'Body', objects3d);
    //console.log('profile', $profile);
    export let model: SexEnum = $profile?.health?.biologicalSex || 'male';

    export let activeLayers: string[] = [];
    export let activeTools: string[] = [];

    export let showShade: boolean = true;
    
    export let selected: THREE.Object3D | null = null;

    let shade: THREE.Group;

    export function reset() {
        resetFocus();
        previousViewState = initialViewState;
        setViewState(initialViewState);
    }


    const originalMaterials = new Map<string, THREE.Material>();

    const objectToFileMapping = Object.entries(objects3d).reduce((acc, [k,v]) => {
        v.objects.forEach(f => {
            acc[f] = k;
        });
        return acc;
    }, {} as {
        [key: string]: string
    });
    
    const mapped: {
        [key: string]: string
    } = {
        //'cholesterol': 'heart',
    }
//  TODO: switch offf
    $: labels = getLabelsMap($profile);

    function getLabelsMap($profile: Profile) {

        return Object.entries(groupByTags($profile.id))
        .filter(([k,v]) => {
            if (mapped[k]) {
                return isObject(mapped[k], 'anatomy')
            } else {
                return isObject(k, 'anatomy')
            }
        })
        .map(([k,v]) => {
            const id: string = mapped[k] || k;

            if (!activeLayers.includes(objectToFileMapping[id])) activeLayers = [...activeLayers, objectToFileMapping[id]];

            return {
                type: v[0].metadata.category,
                id,
                tag: k,
                count: v.length,
                geometry: null,
                object: null,
                label: undefined as any
            }
        });
    }




    let loadedLayers: string[] = [];
    let loadedFiles: string[] = [];
    let ready: boolean = false;

    let container: HTMLDivElement;
    let labelContainer: HTMLDivElement;
    let resizeObserverListener: ResizeObserver;

    let camera: THREE.PerspectiveCamera;
    let scene: THREE.Scene;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls;
    let labelRenderer: CSS2DRenderer | null = null;
    let raycaster: THREE.Raycaster;
    let pointer: THREE.Vector2 = new THREE.Vector2();
    let group: THREE.Group = new THREE.Group();
    let dragged: boolean = false;

    let objects: any[] = [];
    let currentContext: IContext | null = null;

    let animationFrameId: number | null = null;
    let idleFrames: number = 0;
    const MAX_IDLE_FRAMES: number = 60; // ~1s at 60fps


    let initialViewState: ViewState;
    let previousViewState: ViewState | null = null;


/*
    function applyShaderEffect(objectName: string, shaderName: string, options: any = {}): void {
        const object = scene.getObjectByName(objectName);
        //list all object in scene
        console.log('scene', scene.children.map(c => c.name));
        console.log('object', objectName, object);
        if (object instanceof THREE.Mesh && shaders[shaderName]) {
            // Store the original material
            if (!originalMaterials.has(objectName)) {
                originalMaterials.set(objectName, object.material);
            }

            const originalColor = (object.material as THREE.MeshBasicMaterial).color;
            const shaderMaterial = new THREE.ShaderMaterial({
                ...extras,
                ...shaders[shaderName],
                uniforms: {
                    ...shaders[shaderName].uniforms,
                    ...options,
                    originalColor: { value: originalColor }
                }
            });

            // Apply the shader material
            object.material = shaderMaterial;
            object.material.needsUpdate = true;
        }
    }

    function removeShaderEffect(objectName: string): void {
        const object = scene.getObjectByName(objectName);
        const originalMaterial = originalMaterials.get(objectName);
        if (object instanceof THREE.Mesh && originalMaterial) {
            object.material = originalMaterial;
            object.material.needsUpdate = true;
            originalMaterials.delete(objectName); // Remove the entry from the map
        }
    }

    */
    $: defaultState = (model === 'female') ? {
        minZoom : 150,
        maxZoom : 0,
        modelY : -95,
        modelZ : 0,
        cameraY : 35,
        cameraX : 70
    } : {
        minZoom : 1500,
        maxZoom : 300,
        modelY : isTouchDevice() ? -1050 : -960,
        modelZ : isTouchDevice() ? 500 : 600,
        cameraY : 500,
        cameraX : 800
    }

    $: {

        if (activeLayers != loadedLayers) {
            let toLoad = activeLayers.filter(l => !loadedLayers.includes(l));
            //console.log('toLoad', toLoad);
            let filesToLoad = toLoad.reduce((acc, l) => {
                return [...acc, ...objects3d[l as keyof typeof objects3d].files]
            }, [] as string[]).filter(f => !loadedFiles.includes(f));
            let objectsToShow = activeLayers.reduce((acc, l) => {
                return [...acc, ...objects3d[l as keyof typeof objects3d].objects]
            }, [] as string[]);
            loadedLayers = activeLayers;
            updateModel(filesToLoad, objectsToShow);
        }

        toggleShade(showShade);

    }

    let previousLabels: typeof labels = [];

    $: {
        if (ready && labels !== previousLabels) {
            const oldLabels = previousLabels;
            previousLabels = labels;
            if (oldLabels.length > 0) {
                cleanupLabels(oldLabels);
                if (activeLayers === loadedLayers) {
                    refreshLabels();
                }
            }
        }
    }





    function  setHighlight(name: string | null) {
        if (name) {
            if (name == selected?.name) return;
            focusObject(mapped[name] || name);
        } else {
            if (previousViewState) {
                setViewState(previousViewState);
            }
            highlight(null);
            selected = null;
            requestRender();
        }
    }
    

    function setViewState(state: ViewState) {
        if (!state) return;
        new TWEEN.Tween(camera.position)
                    .to({ x: state.position.x, y: state.position.y, z: state.position.z }, 2000)
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .start();
                new TWEEN.Tween(controls.target)
                    .to({ x: state.target.x, y: state.target.y, z: state.target.z }, 2000) // duration in milliseconds
                    .easing(TWEEN.Easing.Cubic.Out)
                    .onUpdate(() => {
                        controls.update(); // Update the controls on each tween update
                    })
                    .start();
        requestRender();
    }


    onMount(() => {
        if (container) init();
        console.log('🧍', 'Mounted');
        
        // Capture initial store values for hydration
        let initialFocused = $focused;
        let initialStore = $store;
        
        const unsubscibeFocus = focused.subscribe((f) => {
            if (!ready) return;
            setHighlight(f.object ?? null);

        });

        const unsubscibeContext = store.subscribe((state) => {
            if (!ready) return;
           if (state.context) {
               setContext(state.context);
           } else {
                clearContext();
           }
        });

        const unsubscribeProfileSwitch = ui.listen("chat:profile_switch", () => {
            if (!ready) return;
            resetFocus();
        });

        // Apply initial values after initialization
        const checkReady = () => {
            if (ready) {
                // Apply initial focused state if it exists
                if (initialFocused && initialFocused.object) {
                    setHighlight(initialFocused.object);
                }
                // Apply initial store context if it exists
                if (initialStore && initialStore.context) {
                    setContext(initialStore.context);
                }
            } else {
                // Check again if not ready yet
                setTimeout(checkReady, 100);
            }
        };
        checkReady();

        return () => {
            unsubscibeFocus();
            unsubscibeContext();
            unsubscribeProfileSwitch();

            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }

            // clear all three.js objects from the scene
            clearObjects(scene);

            if (renderer) {
                renderer.forceContextLoss();
                renderer.dispose();
                (renderer as any).context = null;
                (renderer as any).domElement = null;
                renderer = null;
            }

            (labelRenderer as any).context = null;
            (labelRenderer as any).domElement = null;
            labelRenderer = null;


            
            clearContext();
            if (resizeObserverListener) resizeObserverListener.disconnect();
            if (labelContainer) {
                for (const labelEl of labelContainer.children) {
                    (labelEl as HTMLElement).removeEventListener('click', clickLabel);
                    (labelEl as HTMLElement).removeEventListener('mouseup', mouseUpLabel);
                };
            }

            loadedFiles = [];
            loadedLayers = [];
            console.log('🧍', 'Destroyed');
        }

    });


    function clearObjects(scene: THREE.Scene) {

        for(let i=scene.children.length-1; i>=0; i--){
            let obj = scene.children[i];
            //dispose all object geometries and materials
            if ((obj as any).geometry) (obj as any).geometry.dispose();
            if ((obj as any).material) {
                if ((obj as any).material instanceof Array) {
                    (obj as any).material.forEach((m: any) => m.dispose());
                } else {
                    (obj as any).material.dispose();
                }
            }
            scene.remove(obj);
        }
    }

    async function updateModel(filesToLoad: string[], objectsToShow: string[]) {
        //console.log('updateModel', filesToLoad, objectsToShow);
        let newObjects = await Promise.all(filesToLoad.map((f: string) => loadObj({
            id: f,
            name: f
        })));


        let labelIds = [... new Set(labels.map(l => l.id))];

        insertObject(newObjects, objectsToShow, labelIds, group);

        
        objects.forEach(object => {
            object.traverse( function ( child: any ) {
                // mark labeled objects
                checkObject(child, objectsToShow, labelIds);
            } );
        })
        objects = [...objects, ...newObjects];

        requestRender();
        loadLabels();
        setHighlight($focused.object ?? null);

        if (!initialViewState) initialViewState = {
            position: camera.position.clone(),
            rotation: camera.rotation.clone(),
            target: controls.target.clone()
        }

        dispatch('ready');
    }

    //let names = {}
    function insertObject(o: any[], objectsToShow: string[], labelIds: string[], group: THREE.Group) {

        //let onames = [];

        o.forEach((object: any) => {
            //console.log(object);
            object.traverse( function ( child: any ) {
                // mark labeled objects
                //onames.push(child.name);
                //console.log('child', child.name, child)
                
                if (objectsToShow) checkObject(child, objectsToShow, labelIds);

                if (object.name === 'integumentary_system' && child.name === 'body') {
                    console.log('child...', child.name, child)
                    child.visible = false;
                }
            } );
            //console.log('onames', onames);
            object.position.y = defaultState.modelY;
            object.position.z = defaultState.modelZ;
            object.layers.enableAll();

            //console.log('object', object.name, object)
            //names[o[0].name] = onames;

            group.add( object );
        })

        
        //console.log('names', JSON.stringify(names, null, 2))
    }



    function checkObject(child: any, objectsToShow: string[], labelIds: string[]) {
        if (!child.isMesh)  return;

        if ( objectsToShow.includes(child.name)) {
            //console.log('SHOW', child.name, labelIds);

            if (child.name === 'body' && child.parent.name === 'integumentary_system') {                
                child.visible = false;
            } else {
                //console.log('body', child)
                child.visible = true;
            }



            if ( labelIds.includes(child.name)) {
                // material needs to cloned to distinguish from original
                child.material = updateMaterial(child.material , {
                    color: FOCUS_COLOR
                });
                /*const material = child.material.clone();
                material.color.set( FOCUS_COLOR );
                child.material = material;*/
                let label = labels.find(l => l.id === child.name)
                if (label) {
                    label.geometry = child.geometry;
                    label.object = child;
                }


            }
        } else {
            //console.log('HIDE', child.name, labelIds);
            child.visible = false;
            if ( labelIds.includes(child.name)) {
                let label = labels.find(l => l.id === child.name)
                if (label) {
                    label.geometry = null;
                    label.object = null;
                }
            }

        }

    
    }
    // update material or material array with a given set of properties
    function updateMaterial(material: THREE.Material,
        options: {
            color?: number,
            transparent?: boolean,
            opacity?: number
        }
    ): THREE.Material | THREE.Material[] {
        if (Array.isArray(material )) {
            return material.map((m: THREE.Material) => {
                return updateMaterial(m, options);
            }) as THREE.Material[];
        } else {
            const newMaterial = material.clone();
            Object.keys(options).forEach(key => {
                if ((newMaterial as any)[key] && (newMaterial as any)[key].set) {
                    (newMaterial as any)[key].set((options as any)[key]);
                } else if ((newMaterial as any)[key]) {
                    (newMaterial as any)[key] = (options as any)[key];
                }
            });
            //options.color && newMaterial.color.set( options.color );
            return newMaterial;
        }

        
    }


    function loadObj(setup: {
            id: string,
            name: string,
            color?: number,
            opacity?: number,
            rename?: string,
            material?: THREE.Material
        }) {

        return new Promise((resolve, reject) => {

            setup = Object.assign({
                opacity: DEFAULT_OPACITY,
            }, setup);

            function onProgress( xhr: any ) {
                if ( xhr.lengthComputable ) {
                    //const percentComplete = xhr.loaded / xhr.total * 100;
                    //console.log( 'model ' + Math.round( percentComplete, 2 ) + '% downloaded' );
                }
            }

            function onError(error: any) {
                console.error('🧍', '3D model load error', error);
                reject(error)
            }

            const mtlLoader = new MTLLoader();
            mtlLoader.load('/anatomy_models/' + model + '_' + setup.id + '_obj/' + setup.id + '.mtl', function(materialsCreator) {
                materialsCreator.preload();     
                
/*
                for (const materialName in materialsCreator.materials) {
                    const oldMat = materialsCreator.materials[materialName];
                    
                    // Create a new MeshStandardMaterial
                    const newMat = new THREE.MeshStandardMaterial();
                    
                    // Copy basic properties
                    if (oldMat.color) newMat.color.copy(oldMat.color);
                    if (oldMat.map) newMat.map = oldMat.map;
                    if (oldMat.emissive) newMat.emissive.copy(oldMat.emissive);
                    if (oldMat.emissiveMap) newMat.emissiveMap = oldMat.emissiveMap;
                    if (oldMat.normalMap) newMat.normalMap = oldMat.normalMap;
                    if (oldMat.alphaMap) newMat.alphaMap = oldMat.alphaMap;

                    // Convert shininess (Phong) to roughness (Standard):
                    // Phong shininess range is typically 0-100+, standard roughness is 0-1.
                    // A higher shininess means smoother surface -> lower roughness.
                    // Rough guess: roughness ≈ 1 - (shininess / 100), clamp it between 0 and 1.
                    const shininess = oldMat.shininess !== undefined ? oldMat.shininess : 30;
                    newMat.roughness = THREE.MathUtils.clamp(1 - shininess / 100, 0, 1);
                    
                    // Phong specular isn't directly used in standard materials.
                    // If needed, you can approximate metalness. If specular is strong (like white),
                    // you might set a lower roughness or slightly increase metalness for shiny surfaces.
                    // But a common approach is to just leave metalness at 0 unless you know it's a metal.
                    newMat.metalness = 0.0;

                    // Replace the old material in the material creator
                    materialsCreator.materials[materialName] = newMat;
                }
*/
                const objLoader = new OBJLoader( );
                if (setup.material) {
                    console.log('setup.material', setup.material)
                    const material = setup.material;
                    Object.keys(materialsCreator.materials).forEach(key => {
                        materialsCreator.materials[key] = material;
                    });

                }

                
                objLoader.setMaterials( materialsCreator );
            
                
                objLoader.load( '/anatomy_models/' + model + '_' + setup.id + '_obj/' + setup.id + '.obj', function ( object ) {
                        object.name = setup.rename || setup.name;



                        if (setup.opacity) {
                            object.traverse( function ( child: any ) {
                                if ( child.isMesh ) {
                                    child.geometry.computeVertexNormals();
                                    if (setup.color) {

                                    }
                                    if (setup.opacity) {
                                        child.material.transparent = true;
                                        child.material.opacity = setup.opacity;
                                    }
                                }
                            });
                        }
                        loadedFiles.push(setup.rename || setup.id);
                        resolve(object);
                }, onProgress, onError );
            });
        });
    }


    function cleanupLabels(labelsToClean: typeof labels) {
        for (const label of labelsToClean) {
            if (label.label) {
                label.label.removeFromParent();
                label.label = undefined;
            }
        }
    }

    async function refreshLabels() {
        const labelIds = [...new Set(labels.map(l => l.id))];
        const objectsToShow = activeLayers.reduce((acc, l) => {
            return [...acc, ...objects3d[l as keyof typeof objects3d].objects];
        }, [] as string[]);

        objects.forEach(object => {
            object.traverse(function (child: any) {
                checkObject(child, objectsToShow, labelIds);
            });
        });

        await tick();
        loadLabels();
        requestRender();
    }

    function loadLabels() {
        if (!labelContainer) return;
//        console.log(labelContainer.children);
        for (const [index, labelEl] of [...labelContainer.children].entries()) {
            if(labels[index].geometry) {
                const geom = labels[index].geometry as THREE.BufferGeometry;
                if (!geom.boundingSphere) geom.computeBoundingSphere();
                const label = new CSS2DObject( labelEl as HTMLElement );
                const position = geom.boundingSphere!.center.toArray() as [number, number, number];
                label.position.set( ...position );
                label.center.set( 0, 1 );
                (labels[index].object as any)?.add( label );
                label.layers.set( 0 );
                (labelEl as HTMLElement).addEventListener('click', clickLabel, false);
                (labelEl as HTMLElement).addEventListener('mousedown', mouseUpLabel, false);
                (labelEl as HTMLElement).addEventListener('mouseup', mouseUpLabel, false);
                labels[index].label = label;
            }
        };

        labels.forEach(label => {
            if (label.label){
                if (label.geometry) {
                    label.label.visible = true;
                } else {
                    label.label.visible = false;
                }
            }
        });
    }


    async function init () {

        resizeObserverListener = new ResizeObserver(() => { resize(); requestRender(); });
        resizeObserverListener.observe(container);
        let w = container.offsetWidth;
        let h = container.offsetHeight;
        const minZoom = defaultState.minZoom;
        const maxZoom = defaultState.maxZoom;

        camera = new THREE.PerspectiveCamera( 70, w / h, 1, 10000 );
        camera.position.z = minZoom;
        camera.position.y = defaultState.cameraY;
        camera.position.x =  defaultState.cameraX;

        // scene

        scene = new THREE.Scene();
        raycaster = new THREE.Raycaster();

        scene.add(group);

        const ambientLight = new THREE.AmbientLight( 0xffffff, 0.3 );
        scene.add( ambientLight );

        const light = new THREE.PointLight( 0xffffff, .8 );
        light.position.set( 1, 1, 1 ).normalize();
        camera.add( light );
        scene.add( camera );
        //scene.add( light )

        // Renderer
        //THREE.WebGLRenderer.useLegacyLights = true;
        renderer = new THREE.WebGLRenderer( { alpha: true, antialias: true } );
        renderer.setClearColor( 0x000000, 0 ); // the default
        renderer.setPixelRatio( Math.min(window.devicePixelRatio, 2) );
        renderer.setSize( container.offsetWidth, container.offsetHeight );
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        container.appendChild( renderer.domElement );

        // CSS2DRenderer

        labelRenderer = new CSS2DRenderer();
        labelRenderer.setSize( container.offsetWidth, container.offsetHeight );
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0px';
        container.appendChild( labelRenderer.domElement );
        labelRenderer.domElement.addEventListener('mouseup', onPointerClick, false);


        // Controls
        controls = new OrbitControls( camera, labelRenderer.domElement );
        controls.listenToKeyEvents( container ); // optional

        controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = true;
        controls.zoomSpeed = (isTouchDevice()) ? 0.8 : 0.1;
        //controls.minDistance = maxZoom;
        controls.maxDistance = minZoom;

        // Offset rotation center
        controls.target.set( 
            0,0,0
        );

        controls.addEventListener('start', () => {
            //console.log('start');
            dragged = true;
            requestRender();
        });
        
        /*
        controls.addEventListener('change', (a) => {
            console.log('change')
        });
        */

        controls.addEventListener('end', () => {
            //console.log('end');
            dragged = false;
        });

        controls.maxPolarAngle = Math.PI / 2;

        await loadShade();
        requestRender();
        //window.scene = scene;

        console.log('🧍', 'Ready');
        
        // TODO: better way to handle this - more generic
        /*
        ui.on('context', (context) => {
            setContext(context);
        });
        setContext(ui.context);
        */

        
        ready = true;



        if ($store.context) setContext($store.context);

        //dispatch('ready');

    };

        /**
         * Setting context for particular section or context passed
         * @param context
         */
    let showContextInfo: boolean = false;

    function toggleContextInfo() {
        
        showContextInfo = !showContextInfo;
        //if (showContextInfo) addExperience('curiosity');
    }
    
    let originalState: any = {
        layers : null
    };

    function setContext(context: string | IContext)  {
        clearContext();
        //console.log('🧍', 'Setting Context', context);

        if (!context) return;
        if (typeof context === 'string' && !(contexts as any)[context]) return;

        const contextToRun = (typeof context === 'string') ? (contexts as any)[context] : context;
        const storeState: boolean = currentContext == null

        currentContext = {
            name: contextToRun.name,
        };

        if (contextToRun.layers) {
            if (storeState) originalState.layers = activeLayers;
            activeLayers = contextToRun.layers;
        }

        if (contextToRun.shader) {
            //applyShaderEffect(contexts[context].object, contexts[context].shader, contexts[context].options);
        }
        if (contextToRun.animation) {
            currentContext.animation = new contextToRun.animation(scene);
            requestRender();
        }

/*        if (contextToRun.focus) {
            // TODO - support multiple objects
            console.log('focus', contextToRun.focus[0]);
            focusObject(contextToRun.focus[0]);
        }*/

        if (contextToRun.info) {
            currentContext.info = contextToRun.info;
        }
        
    }
    function clearContext() {

        if (currentContext) {
            if (currentContext.shader) {
                //removeShaderEffect(contexts[context].object);
            }
            if (currentContext.animation) {
                currentContext.animation.destroy();
            }

            if (currentContext.info) {
                currentContext.info = null;
            }
        }
        if (originalState.layers) {
            activeLayers = originalState.layers;
            originalState.layers = null;
        }
        currentContext = null;
    }





    async function loadShade() {
        insertObject([await loadObj({
            id: 'integumentary_system',
            name: 'integumentary_system',
            color: 3,
            opacity: .3,
            rename: 'shade_skin',
            material:  new THREE.MeshPhysicalMaterial({
                metalness: 0.2,
                roughness: 0.5,
                //envMapIntensity: 0.9,
                //clearcoat: 1,
                transmission: .8,
                color: 0xCCCCCC,
                reflectivity: 0.5,
                //refractionRatio: 0.985,
                //ior: 0.1,
                side: THREE.BackSide,
                depthWrite: false,
            })
        })], ['body'], [], scene as any);
        toggleShade(showShade);
    }

    function toggleShade(state: boolean) {
        if (scene && !shade) shade = scene.getObjectByName('shade_skin') as any;
        if (shade) shade.visible = state;
    }


    function resize () {
        if (!container || !renderer) return;
        camera.aspect = container.offsetWidth / container.offsetHeight;
        camera.updateProjectionMatrix();
        renderer.setSize( container.offsetWidth, container.offsetHeight );
        if (labelRenderer) labelRenderer.setSize( container.offsetWidth, container.offsetHeight );
    }

    function requestRender() {
        idleFrames = 0;
        if (animationFrameId === null) {
            animationFrameId = requestAnimationFrame(animate);
        }
    }

    function animate() {
        if (!controls || !renderer) {
            animationFrameId = null;
            return;
        }

        const hasTweens = TWEEN.getAll().length > 0;
        const hasAnimation = !!(currentContext && currentContext.animation);

        if (hasTweens) TWEEN.update();
        const controlsChanged = controls.update();
        if (hasAnimation) currentContext!.animation!.update();

        if (controlsChanged || hasTweens || hasAnimation) {
            render();
            idleFrames = 0;
        } else {
            idleFrames++;
        }

        if (idleFrames < MAX_IDLE_FRAMES || hasTweens || hasAnimation) {
            animationFrameId = requestAnimationFrame(animate);
        } else {
            render(); // final clean frame
            animationFrameId = null;
        }
    }

    function render() {
        if (renderer) renderer.render( scene, camera );
        if (labelRenderer) labelRenderer.render( scene, camera );
    }


    function clickLabel(event: MouseEvent) {
        //console.log('clickLabel');
        event.stopPropagation();
        event.preventDefault();
        console.log('click label')
        sounds.focus.play();
        ($state as any).focusView = false;
    }

    function mouseUpLabel(event: MouseEvent) {
        ($state as any).focusView = true;
        event.stopPropagation();
        event.preventDefault();
        const a = (event.target as HTMLElement)?.closest('a');
        if (a) {
            const href = a.getAttribute('href');
            if (href) goto(href);
            focused.set({ object: a.dataset.id });
        }
    }




    function focusObject (objects: string | THREE.Object3D | (string | THREE.Object3D)[] | null) {

        const processObjects: THREE.Object3D[] = [];

        if (!objects) return;
        if (!Array.isArray(objects)) objects = [objects];

        objects.forEach((o: any) => {
            if (typeof o === 'string') {
                const object = scene.getObjectByName(o);
                if (object) processObjects.push(object);
            } else {
                processObjects.push(o);
            }
        });


        if (processObjects.length === 0) return;
        if (processObjects.length > 1) {
            console.warn('Multiple objects to focus not supported yet');
        }

        const object = processObjects[0];
       // console.log('Object', object);
        // store original position and rotation
        if (!selected) {
            previousViewState = {
                position: camera.position.clone(),
                rotation: camera.rotation.clone(),
                target: controls.target.clone()
            }
        }

        //console.log('focusObject', object);
        highlight(object);
        selected = object;

        // let's focus the object into view
        

        const aabb = new THREE.Box3().setFromObject(object);
        const sphere = aabb.getBoundingSphere(new THREE.Sphere(new THREE.Vector3()));
        //console.log('sphere', sphere);
  
        const center = sphere.center;
        const radius = sphere.radius;

        // Adjust the distance as needed
        const fovInRadians = (camera.fov * Math.PI) / 180;
        const distance = radius / Math.sin(fovInRadians / 2);


        const targetPosition = new THREE.Vector3(
            center.x,
            center.y,
            center.z + (distance * 2)
        );



        // Position the camera at this distance
        camera.lookAt(center);
        camera.updateProjectionMatrix();

        new TWEEN.Tween(camera.position)
            .to({ x: targetPosition.x, y: targetPosition.y, z: targetPosition.z }, 2000) // 2000 milliseconds
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();


        // twen the controls target to the center of the object
        new TWEEN.Tween(controls.target)
            .to({ x: center.x, y: center.y, z: center.z }, 2000) // duration in milliseconds
            .easing(TWEEN.Easing.Cubic.Out)
            .onUpdate(() => {
                controls.update(); // Update the controls on each tween update
            })
            .start();

        requestRender();
    }

    //let pointTimer: ReturnType<typeof setTimeout>;
    let tap: number = 0;
    function onPointerClick (event: MouseEvent) {

            if (dragged) return;

            let now = Date.now();
            if (tap && (now - tap) < 300) {
//                    $state.focusView = !$state.focusView;
                    tap = now;
                return;
            } else {
                tap = now;
            }

            if (!activeTools.includes('selection')) return;


            var rect = container.getBoundingClientRect();
            var x = event.clientX - rect.left; //x position within the element.
            var y = event.clientY - rect.top;  //y position within the element.
            //pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
            //pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;

            pointer.x = ( x / rect.width ) * 2 - 1;
            pointer.y = - ( y / rect.height ) * 2 + 1;

            raycaster.setFromCamera( pointer, camera );
            //const intersects = raycaster.intersectObject( group, true );
            const intersects = raycaster.intersectObjects( group.children, true);
            if ( intersects.length > 0 ) {
                while(intersects.length > 0 && !intersects[ 0 ].object?.visible) {
                    intersects.shift();
                }
                if (intersects.length === 0) return;

                const object = intersects[ 0 ].object;
                if (object.name) {
                    sounds.focus.play();
                    //addExperience('curiosity');
                    //highlight(object);
                    console.log('click', object.name, object);
                    focused.set({ object: object.name });
                    selected = object;
                }
            } else {
                //highlight(null)
                focused.set({ object: undefined });
                selected = null;
            }
    }

    function highlight (object: THREE.Object3D | null) {
        if (selected) {
            selected.traverse( function ( child: any ) {
                if ( child.isMesh ) {
                    child.material = child.oldMaterial;
                }
            });
        }

        // traverse all object and set material opacity to .5
        scene.traverse( function ( child: any ) {
            if ( child.isMesh && child.material) {
                // material needs to cloned to distinguish from original
                if(!child.parent || child.parent?.name !== 'shade_skin') {
                    // material needs to cloned to distinguish from original
                    child.oldMaterial = child.material;
                    child.material = updateMaterial(child.material, { opacity: (object == null) ? DEFAULT_OPACITY : UNFOCUSED_OPACITY , transparent: true }) as any;
                }


            }
        });



        if (object) {
            //ui.emit('highlight-object', object.name);
            object.traverse( function ( child: any ) {
                if ( child.isMesh && child.material) {
                    // material needs to cloned to distinguish from original
                    child.oldMaterial = child.material;
                    child.material = updateMaterial(child.material, { color: HIGHLIGHT_COLOR, opacity: 1 }) as any;

                    //console.log('highlight', child.name, child.material);
                    /*
                    const material = child.material.clone();
                    child.oldMaterial = child.material;
                    material.color.set( HIGHLIGHT_COLOR );
                    child.material = material;*/
                }
            });
        } 
    }

    function resetFocus() {
        focused.set({ object: undefined });
        clearContext();
        setViewState(initialViewState);
    }   

</script>

<div class="labels" bind:this={labelContainer}>
    {#each labels as label}
    <div class="label" id="label-id-{label.id}">
        <a href="/med/p/{$profile.id}/documents/?tags={label.tag}" class="highlight" data-id={label.id}>
            <Label type={label.type} />
        </a>
    </div>
    {/each}
</div>

<div class="model" bind:this={container}></div>

{#if selected}
    {#key selected}
    <div class="selected" transition:fade >
        {#if $t('anatomy.'+ selected.name) == 'anatomy.'+ selected.name}
            {selected.name}
        {:else}
            {$t('anatomy.'+ selected.name)}
        {/if}
        <button on:click={resetFocus} aria-label="Reset focus">
            <svg>
                <use href="/icons.svg#close"></use>
            </svg>
        </button>
    </div>
    {/key}
{/if}


{#if currentContext && currentContext.info}
    <div class="context-info" transition:fade|local>
        <button class="close" on:click={toggleContextInfo}>
            {#if showContextInfo}
            <svg>
                <use href="/icons.svg#close"></use>
            </svg>
            {:else}
            <svg>
                <use href="/icons.svg#info"></use>
            </svg>
            {/if}

        </button>
        {#if showContextInfo}
        <svelte:component this={currentContext.info} />
        {/if}
    </div>
{/if}


<style>
    .model {
        position: relative;
        width: 100%;
        height: 100%;
        transform: translateX(0);
        /*background-image: radial-gradient(ellipse at center, rgba(102, 255, 196, 100)  0%, rgba(102, 255, 196, 0) 100%);*/
    }
    /*
    @media only screen and (min-width: 769px) {
        .model {
            width: 200%;
            height: 100%;
            transform: translateX(-40%);
        }
    }*/
    .selected {
        position: absolute;
        top: 1rem;
        right: 1rem;
        padding: 0 0 0 1rem;
        pointer-events: none;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 1.1rem;
        background-color: rgba(0,0,0,.3);
        color: #FFF;
        border-radius: var(--border-radius);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        text-transform: uppercase;
        pointer-events: all;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
    }
    .selected button {
        margin-left: .5rem;
        transition: background-color .2s ease-in-out;
    }
    @media (hover: hover) {
    .selected button:hover {
        background-color: var(--color-negative);
    }
    }
    .selected button svg {
        width: 2rem;
        height: 2rem;
        padding: .2rem;
        fill: currentColor;
    }
    @media only screen and (max-width: 768px) { 
        .selected {
            display: none;
        }
        :global(.focus) .selected {
            display: flex;
            top: calc(var(--top-offset) + 1rem);
            left: auto;
            right: 1rem;
            
        }
    }

    .labels {
        display: none;
    }

    .model :global(.label) {
        left: 0;
        top: 0;
        width: 1px;
        height: 1px;
    }
    .model :global(.highlight) {
        display: block;
        transform: translate(-50%, -50%);
        width: 3rem;
        height: 3rem;
        border-radius: 100%;
        border: 1px solid #FFF;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        background: transparent;
        padding: .7rem;
        transition: all .2s ease-in-out;
    }
    .model :global(.highlight .icon) {
        display: block;
        height: 100%;
        width: 100%;
        border-radius: 100%;
        border: 1px solid var(--color-white);
        /*background: var(--label-color);*/
        box-shadow: 1px 1px 6px 0 rgba(0,0,0.3);
        color: #FFF;
        transform: scale(.5);
        transition: transform .2s ease-in-out;
    }
    .model :global(.highlight .icon svg) {
        width: 100%;
        height: 100%;
        transform: scale(.6);
        opacity: 0;
        transition: opacity .2s ease-in-out;
    }

    
    .model :global(.highlight:hover) {
        padding: .5rem;
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        width: 4rem;
        height: 4rem;
    }
    .model :global(.highlight:hover .icon) {
        transform: scale(1);
    }
    .model :global(.highlight:hover .icon svg) {
        opacity: 1
    }


    .context-info {
        position: absolute;

        left: 3rem;
        max-width: calc(var(--width) - 6rem);
        min-width: 2.5rem;
        max-height: calc(var(--height) - 2rem);
        min-height: 2.5rem;;
        bottom: 1rem;
        background-color: rgba(var(--color-background-rgb), .6);
        text-align: left;
        backdrop-filter: blur(2px);
        border-radius: var(--border-radius);
        box-shadow: 2px 2px 10px rgba(0,0,0,.2);
    }
    .context-info :global(.close svg) {
        width: 100%;
        height: 100%;

    }
    .context-info .close {
        position: absolute;
        top: 0;
        right: 0;
        padding: .5rem;
        width: 2.5rem;
        height: 2.5rem;
        cursor: pointer;
    }
    .context-info :global(.h2) {
        padding: 1rem .5rem .5rem;
    }
    .context-info :global(.p) {
        background-color: var(--color-background);
        padding: 1rem;
        margin: 0;
        text-align: justify;
    }
</style>