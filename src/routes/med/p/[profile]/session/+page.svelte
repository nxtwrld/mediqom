<script lang="ts">
    //import { type Profile } from '$lib/types.d';
    import { AudioState, convertFloat32ToMp3} from '$lib/audio/microphone';
    import { onMount, onDestroy} from 'svelte';
    import Diagnosis from '$components/profile/Session/Diagnosis.svelte';
    import Models from '$components/profile/Session/Models.svelte';
    import Transcript from '$components/profile/Session/Transcript.svelte';
    import AudioButton from '$components/profile/Session/AudioButton.svelte';
    import LoaderThinking from '$components/ui/LoaderThinking.svelte';
    import Report from '$components/profile/Session/FinalizeReport.svelte';
    //import doctor, { getDoctorSignature } from '$lib/med/doctor';
    import { profile } from '$lib/profiles';
    import { float32Flatten } from '$lib/array';
    import { ANALYZE_STEPS } from '$lib/types.d';
    import { AnalysisMerger } from '$lib/session-deprecated/analysis-merger';
    import { sessionStorage, loadSessionData, removeSessionData, hasStoredSessionData, type StoredSessionData } from '$lib/session-deprecated/local-storage';
    import { log } from '$lib/logging/logger';
    import { t } from '$lib/i18n';
  
    
    const MIN_AUDIO_SIZE: number = 10000 * 8;
    const MIN_TEXT_LENGTH: number = 100;
    const DEFAULT_WAIT_TIME: number = 10000;
    // UI Session States
    enum Views {
        "start",
        "analysis",
        "report"
    }

    let view: Views = $state(Views.start);

    let models = $state([
            {
                name: 'GP',
                active: true,
                available: true,
                disabled: false
            },
            {
                name : 'PT',
                active: false,
                available: false,
                disabled: true
            },
            {
                name: 'VOICE',
                active: false,
                available: false,
                disabled: true
            }
        ]);

    // Language configuration - change this to set the UI language
    const UI_LANGUAGE = 'en'; // 'en' for English, 'cs' for Czech
    
    // Get proper language codes for different APIs
    function getLanguageForAPI(api: 'session' | 'analysis'): string {
        if (api === 'session') {
            return UI_LANGUAGE; // 'en' or 'cs'
        } else if (api === 'analysis') {
            return UI_LANGUAGE === 'en' ? 'english' : 'czech'; // Full language names for analysis API
        }
        return UI_LANGUAGE;
    }

    let texts: string[] = [];
    let audioState: AudioState = $state(AudioState.Ready);

    // Real-time session management
    let sessionId: string | null = $state(null);
    let useRealtime: boolean = $state(true); // Enable real-time by default
    let realtimeTranscripts: any[] = $state([]);

    let analysis: any = $state({});

    let silenceTimer: ReturnType<typeof setTimeout> | undefined = undefined;
    let speechChunks: Float32Array[] =$state([]);

    let hasResults = $derived(view !== Views.start);

    let newSpeech: boolean = $state(false);

    // Initialize the analysis merger for gradual refinement
    const analysisMerger = new AnalysisMerger();
    let mergeStats = $state({ diagnosis: { total: 0, new: 0, updated: 0 } });

    // Local storage integration
    let autoSaveCleanup: (() => void) | null = null;
    let hasRestoredData = $state(false);
    let dataRestoredFromSessionId = $state<string | null>(null);

    // Hybrid analysis trigger logic for frontend
    let lastAnalysisTime = 0;
    function shouldTriggerHybridAnalysis(): boolean {
        if (realtimeTranscripts.length === 0) return false;
        
        // Hybrid approach thresholds
        const INTERVAL_THRESHOLD = 30000; // 30 seconds
        const MIN_CHARACTERS = 200; // Minimum meaningful content
        const MAX_CHARACTERS = 500; // Maximum before forcing analysis
        const MIN_EXCHANGES = 2; // Minimum conversational exchanges
        
        const totalText = realtimeTranscripts.map(t => t.text).join(' ');
        const timeSinceLastAnalysis = Date.now() - lastAnalysisTime;
        
        // Primary trigger: 30-second intervals
        const intervalReached = timeSinceLastAnalysis >= INTERVAL_THRESHOLD;
        
        // Secondary conditions
        const hasMinimalContent = totalText.length >= MIN_CHARACTERS;
        const hasSignificantContent = totalText.length >= MAX_CHARACTERS;
        
        // Speaker change detection
        const speakers = [...new Set(realtimeTranscripts.map(t => t.speaker).filter(Boolean))];
        const hasSpeakerChanges = speakers.length >= 2;
        
        // Content quality checks
        const hasEnoughExchanges = realtimeTranscripts.length >= MIN_EXCHANGES;
        const avgTranscriptLength = totalText.length / Math.max(realtimeTranscripts.length, 1);
        const hasSubstantialExchanges = avgTranscriptLength >= 20;
        
        // Skip conditions
        const onlyShortResponses = avgTranscriptLength < 10 && totalText.length < 100;
        const onlyFillerWords = isFillerContentFrontend(totalText);
        const singleSpeakerDominating = !hasSpeakerChanges && realtimeTranscripts.length >= 3;
        
        // Skip analysis if content is not meaningful
        if (onlyShortResponses || onlyFillerWords || singleSpeakerDominating) {
            return false;
        }
        
        // Trigger conditions
        const shouldTrigger = (
            hasSignificantContent || // Force if too much content accumulated
            (intervalReached && hasMinimalContent && hasSpeakerChanges) || // Ideal: 30s + content + speakers
            (intervalReached && hasMinimalContent && hasEnoughExchanges && hasSubstantialExchanges) // Fallback: 30s + quality content
        );
        
        if (shouldTrigger) {
            lastAnalysisTime = Date.now();
        }
        
        return shouldTrigger;
    }
    
    // Helper function to detect filler content (frontend version)
    function isFillerContentFrontend(text: string): boolean {
        const fillerPatterns = [
            /^(yes|no|ok|okay|mm-?hmm?|uh-?huh|yeah|right|sure|exactly|indeed|i see|got it|understood|alright)[\s.!?]*$/i,
            /^(ano|ne|dobře|jasně|rozumím|chápu|aha|mhm|hmm|přesně|souhlasím|v pořádku)[\s.!?]*$/i, // Czech equivalents
            /^[\s.!?]*$/,  // Only punctuation/whitespace
            /^(.)\1{3,}$/, // Repeated characters (aaa, ...)
        ];
        
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        if (sentences.length === 0) return true;
        
        const fillerSentences = sentences.filter(sentence => 
            fillerPatterns.some(pattern => pattern.test(sentence.trim()))
        );
        
        // Consider it filler if 80% or more sentences are filler
        const fillerRatio = fillerSentences.length / sentences.length;
        return fillerRatio >= 0.8;
    }

    // Handle real-time transcripts
    function handleRealtimeTranscript(transcript: any) {
        log.session.debug('Real-time transcript received in session page:', transcript);
        realtimeTranscripts = [...realtimeTranscripts, transcript];
        
        // Update texts array for display
        if (transcript.is_final) {
            log.session.info('Final transcript, adding to texts:', transcript.text);
            texts = [...texts, transcript.text];
            
            // Update analysis.conversation for the Transcript component
            if (!analysis.conversation) {
                analysis.conversation = [];
            }
            
            // Convert transcript to conversation format expected by Transcript component
            analysis.conversation = [...analysis.conversation, {
                speaker: transcript.speaker || 'patient',
                text: transcript.text,
                stress: 'medium', // Default stress level
                urgency: 'medium' // Default urgency level
            }];
            
            log.session.debug('Added to conversation:', {
                speaker: transcript.speaker,
                text: transcript.text.substring(0, 50) + '...',
                conversationLength: analysis.conversation.length
            });
            
            // Switch to analysis view as soon as we have meaningful content
            const totalTextLength = texts.join(' ').length;
            const shouldSwitchToAnalysis = totalTextLength > 20 && view === Views.start;
            
            log.session.debug('Transcript view switch decision:', {
                totalTextLength,
                currentView: view,
                shouldSwitch: shouldSwitchToAnalysis,
                transcriptText: transcript.text,
                conversationEntries: analysis.conversation.length
            });
            
            if (shouldSwitchToAnalysis) {
                log.session.info('Switching to analysis view based on transcript content');
                view = Views.analysis;
            }
            
            // Trigger incremental analysis using hybrid approach for test transcripts
            const isTestTranscript = transcript.id?.startsWith('test_transcript_');
            if (isTestTranscript && shouldTriggerHybridAnalysis()) {
                log.session.info('Triggering hybrid analysis based on conversation cadence');
                setTimeout(() => {
                    analyzeTranscription(ANALYZE_STEPS.transcript, true);
                }, 1000); // Short delay to avoid overwhelming the system
            }
        }
    }

    // Handle real-time analysis updates
    function handleRealtimeAnalysis(analysisUpdate: any) {
        log.session.info('Real-time analysis received in session page:', analysisUpdate);
        log.session.debug('Analysis update structure:', {
            hasDiagnosis: !!analysisUpdate.diagnosis,
            diagnosisLength: analysisUpdate.diagnosis?.length || 0,
            diagnosisType: typeof analysisUpdate.diagnosis,
            hasTreatment: !!analysisUpdate.treatment,
            treatmentLength: analysisUpdate.treatment?.length || 0,
            treatmentType: typeof analysisUpdate.treatment,
            hasIncremental: !!analysisUpdate.incremental,
            fullKeys: Object.keys(analysisUpdate)
        });
        
        // Merge with existing analysis
        const oldAnalysis = $state.snapshot(analysis);
        analysis = { ...analysis, ...analysisUpdate };
        
        log.session.debug('Analysis state after merge:', {
            oldDiagnosisLength: oldAnalysis.diagnosis?.length || 0,
            newDiagnosisLength: $state.snapshot(analysis).diagnosis?.length || 0,
            oldTreatmentLength: oldAnalysis.treatment?.length || 0,
            newTreatmentLength: $state.snapshot(analysis).treatment?.length || 0,
            currentView: view,
            Views: Views
        });
        
        // Switch to analysis view if we have meaningful results
        const analysisSnapshot = $state.snapshot(analysis);
        const shouldSwitchView = (analysisUpdate.diagnosis?.length > 0 || 
                                 analysisUpdate.treatment?.length > 0 ||
                                 analysisSnapshot.diagnosis?.length > 0 ||
                                 analysisSnapshot.treatment?.length > 0);
        
        log.session.debug('View switch decision:', {
            shouldSwitchView,
            currentView: view,
            targetView: Views.analysis,
            conditions: {
                updateHasDiagnosis: analysisUpdate.diagnosis?.length > 0,
                updateHasTreatment: analysisUpdate.treatment?.length > 0,
                analysisHasDiagnosis: analysisSnapshot.diagnosis?.length > 0,
                analysisHasTreatment: analysisSnapshot.treatment?.length > 0
            }
        });
        
        if (shouldSwitchView) {
            log.session.info('Switching to analysis view due to real-time results');
            view = Views.analysis;
        } else {
            log.session.debug('Not switching view - no meaningful analysis results yet');
        }
    }

    let processingStatus = 'idle';
    let waitingRequest: boolean = false;
    async function processData(forceTranscription: boolean = false) {

        if (silenceTimer) {
            clearTimeout(silenceTimer);
        }

        // we are already processing a batch
        if (processingStatus === 'processing') {
            waitingRequest = true;
            log.session.debug('Already processing previous batch');
            return;
        }

        // no data to process
        if (speechChunks.length === 0) {
            log.session.debug('No data to process');
            return;
        }

        // we are not ready to transcribe - we want to wait for more data
        if (!shouldWeTranscript() && !forceTranscription) {
            log.session.debug('Not enough data to process');
            silenceTimer = setTimeout(() => {
                // force the transcription after 10 seconds of silence
                log.session.debug('Forcing transcription');
                processData(true);
            }, DEFAULT_WAIT_TIME);
            return;
        }
        waitingRequest = false;
        processingStatus = 'processing';
        log.session.debug('Processing audio data');

        const chunk: Float32Array = float32Flatten(speechChunks);
        speechChunks = [];

    
        const mp3Blob = await convertFloat32ToMp3(chunk, 16000);
        //const mp3Blob = await convertBlobToMp3(new Blob(audioChunks));
        
        const formData = new FormData();
        formData.append('file', mp3Blob, 'audio.mp3')
        formData.append('instructions', JSON.stringify({
            lang: getLanguageForAPI('session')
        }));

        try {
            const results = await fetch('/v1/transcribe', {
                method: 'POST',
                /*headers: {
                    'Content-Type': 'application/json'
                },*/
                body: formData
            });
            const transcript = await results.json();
            log.session.debug('Transcript result', transcript);
            
            texts = [...texts, transcript.text];
            processingStatus = 'idle';
            analyzeTranscription(ANALYZE_STEPS.transcript, forceTranscription);

        } catch (e) {
            log.session.error(e);
            processingStatus = 'idle';
        }
       

    }

    function shouldWeTranscript(): boolean {
        const size = speechChunks.reduce((acc, chunk) => acc + chunk.length, 0);
        log.session.debug('Audio size: ', size, size > MIN_AUDIO_SIZE);

        if (size > MIN_AUDIO_SIZE) {
            return true;
        }
        return false;
    }

    let lastAnalyzedTextLength: number = 0;
    let activeModels: string[] = $state([]);
    let analysisTimer: ReturnType<typeof setTimeout> | undefined = undefined;  


    //console.log(Object.keys(ANALYZE_STEPS).filter(key => isNaN(Number(key))))

    async function analyzeTranscription(type: ANALYZE_STEPS = ANALYZE_STEPS.transcript, forceAnalysis: boolean = false) {
        

        if (processingStatus === 'processing') {
            log.session.debug('Already processing next batch - wait for it to finish');
            return;
        }

        if (analysisTimer) {
            clearTimeout(analysisTimer);
        }

        let text = texts.join('\r\n');

        if (type == ANALYZE_STEPS.transcript && text.length === lastAnalyzedTextLength) {
            log.session.debug('No new data to analyze');
            return;
        }

        if (type == ANALYZE_STEPS.transcript && text.length === lastAnalyzedTextLength + MIN_TEXT_LENGTH && !forceAnalysis) {
            log.session.debug('Not enough data to analyze');
            analysisTimer = setTimeout(() => {
                log.session.debug('Forcing analysis');
                analyzeTranscription(type, true);
            }, DEFAULT_WAIT_TIME);
            return;
        }

        log.session.debug('Analyzing', type);

        // currently running models
        activeModels = models.filter(m => m.active).map(m => m.name);
        lastAnalyzedTextLength = text.length;

        // Get previous analysis snapshot for context
        const previousAnalysisSnapshot = type === ANALYZE_STEPS.diagnosis ? $state.snapshot(analysis) : undefined;

        const response = await fetch('/v1/med/session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                language: getLanguageForAPI('analysis'),
                type,
                models: activeModels,
                text : (type === ANALYZE_STEPS.transcript) ? text : JSON.stringify(analysis),
                previousAnalysis: previousAnalysisSnapshot // Pass previous context for gradual refinement
            })
        });
        const result = await response.json();

        newSpeech = false;
        activeModels = [];

        // check if the conversation is medical - if not, end the analysis
        if (result.hasOwnProperty('isMedicalConversation') && result.isMedicalConversation === false) {
            log.session.info('Not a medical conversation. Ending analysis.');
            return;
        }
        
        // Use the analysis merger for gradual refinement instead of direct replacement
        if (type === ANALYZE_STEPS.diagnosis) {
            // Merge each type of items using the smart merger
            const diagnosisResult = analysisMerger.mergeItemArray(result.diagnosis || [], 'diagnosis');
            const treatmentResult = analysisMerger.mergeItemArray(result.treatment || [], 'treatment');
            const medicationResult = analysisMerger.mergeItemArray(result.medication || [], 'medication');
            const followUpResult = analysisMerger.mergeItemArray(result.followUp || [], 'followUp');
            const questionsResult = analysisMerger.mergeItemArray(result.clarifyingQuestions || [], 'clarifyingQuestions');
            const recommendationsResult = analysisMerger.mergeItemArray(result.doctorRecommendations || [], 'doctorRecommendations');
            
            // Update the analysis with merged data
            analysis = {
                ...analysis,
                ...result,
                diagnosis: analysisMerger.getItemsData('diagnosis'),
                treatment: analysisMerger.getItemsData('treatment'),
                medication: analysisMerger.getItemsData('medication'),
                followUp: analysisMerger.getItemsData('followUp'),
                clarifyingQuestions: analysisMerger.getItemsData('clarifyingQuestions'),
                doctorRecommendations: analysisMerger.getItemsData('doctorRecommendations')
            };
            
            // Update merge statistics for UI feedback
            mergeStats = analysisMerger.getStats();
            
            log.session.debug('Analysis merged with gradual refinement:', {
                diagnosis: diagnosisResult.summary,
                treatment: treatmentResult.summary,
                medication: medicationResult.summary,
                questions: questionsResult.summary,
                recommendations: recommendationsResult.summary,
                totalStats: mergeStats
            });
        } else {
            // For transcript analysis, use direct assignment
        analysis = Object.assign(analysis || {}, result);
        }
        
        view = Views.analysis;

        log.session.debug('Analysis complete', $state.snapshot(analysis));
        
        // if the analysis is complete, start the next step, if we are not already processing a new batch, wait for it to finish
        if (type == ANALYZE_STEPS.transcript && processingStatus === 'idle' && !waitingRequest) {
            // analysis second step (only when no newer batch is being processed)
            analyzeTranscription(ANALYZE_STEPS.diagnosis);
        }

    }

    function resetAnalysis() {
        log.session.debug('Resetting analysis state...');
        analysisMerger.clear();
        analysis = { conversation: [] };
        texts = [];
        realtimeTranscripts = [];
        mergeStats = { diagnosis: { total: 0, new: 0, updated: 0 } };
        view = Views.start;
        hasRestoredData = false;
        dataRestoredFromSessionId = null;
        log.session.debug('Analysis state reset complete');
    }

    /**
     * Try to restore session data from local storage
     */
    function tryRestoreSessionData(sessionIdToRestore?: string): boolean {
        // Only try to restore data if we're running in the browser
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
            log.session.warn('Not running in browser, skipping session data restoration');
            return false;
        }

        log.session.debug('Checking for stored session data...', { sessionIdToRestore, currentSessionId: sessionId });
        
        let targetSessionId = sessionIdToRestore || sessionId;
        
        // If no specific session ID provided, try to find the most recent session
        if (!targetSessionId) {
            const storedSessions = sessionStorage.getStoredSessions();
            log.session.debug('Available stored sessions:', storedSessions);
            
            if (storedSessions.length === 0) {
                log.session.info('No stored sessions found');
                return false;
            }
            
            // Find the most recent session with valid data
            let mostRecentSession = null;
            let mostRecentTime = 0;
            
            for (const sessionIdCandidate of storedSessions) {
                const sessionData = loadSessionData(sessionIdCandidate);
                if (sessionData && sessionData.lastUpdated > mostRecentTime) {
                    mostRecentSession = sessionData;
                    mostRecentTime = sessionData.lastUpdated;
                    targetSessionId = sessionIdCandidate;
                }
            }
            
            if (!mostRecentSession) {
                log.session.info('No valid sessions found to restore');
                return false;
            }
            
            log.session.info('Found most recent session to restore:', {
                sessionId: targetSessionId,
                lastUpdated: new Date(mostRecentTime).toLocaleString(),
                view: mostRecentSession.view,
                analysisKeys: Object.keys(mostRecentSession.analysisData)
            });
        }

        // Ensure we have a valid session ID at this point
        if (!targetSessionId) {
            log.session.error('No valid session ID found for restoration');
            return false;
        }

        // Check if we have stored data for the target session
        if (!hasStoredSessionData(targetSessionId)) {
            log.session.debug('No stored data found for session:', targetSessionId);
            return false;
        }

        // Load the stored data
        const storedData = loadSessionData(targetSessionId);
        if (!storedData) {
            log.session.error('Failed to load stored session data');
            return false;
        }

        log.session.info('Restoring session data from local storage:', {
            sessionId: targetSessionId,
            view: storedData.view,
            analysisKeys: Object.keys(storedData.analysisData),
            transcriptCount: storedData.transcripts.length,
            realtimeTranscriptCount: storedData.realtimeTranscripts.length,
            textsCount: storedData.texts.length
        });

        // Restore the data
        try {
            // Set the session ID first
            sessionId = targetSessionId;
            
            // Restore analysis data
            analysis = storedData.analysisData;
            texts = storedData.texts;
            realtimeTranscripts = storedData.realtimeTranscripts;
            
            // Restore view state - force to analysis view if we have meaningful data
            const hasAnalysisData = Object.keys(storedData.analysisData).length > 0 || 
                                   storedData.texts.length > 0 || 
                                   storedData.realtimeTranscripts.length > 0;
            
            if (hasAnalysisData) {
                if (storedData.view === 'report') {
                    view = Views.report;
                } else {
                    // Default to analysis view if we have any meaningful data
                    view = Views.analysis;
                }
            }

            // Restore models if available
            if (storedData.models && storedData.models.length > 0) {
                models = storedData.models;
            }

            // Mark that we've restored data
            hasRestoredData = true;
            dataRestoredFromSessionId = targetSessionId;

            log.session.info('Session data restored successfully', {
                sessionId: targetSessionId,
                restoredView: Object.keys(Views)[view] || 'unknown',
                analysisKeys: Object.keys(analysis),
                conversationLength: analysis.conversation?.length || 0,
                textsLength: texts.length,
                realtimeTranscriptsLength: realtimeTranscripts.length
            });

            return true;
        } catch (error) {
            log.session.error('Failed to restore session data:', error);
            return false;
        }
    }

    /**
     * Set up auto-saving for the current session
     */
    function setupSessionAutoSave(currentSessionId: string) {
        log.session.debug('Setting up auto-save for session:', currentSessionId);

        // Clean up any existing auto-save
        if (autoSaveCleanup) {
            autoSaveCleanup();
        }

        // Set up new auto-save
        autoSaveCleanup = sessionStorage.setupAutoSave(currentSessionId, () => {
            const viewString = Object.keys(Views)[view] || 'start';
            return {
                analysisData: analysis,
                transcripts: [], // We don't need to store server transcripts in local storage
                realtimeTranscripts: realtimeTranscripts,
                texts: texts,
                view: viewString,
                models: models,
                language: getLanguageForAPI('session')
            };
        });

        log.session.debug('Auto-save setup complete for session:', currentSessionId);
    }

    /**
     * End the current session and clean up local storage
     */
    function endSession() {
        log.session.info('Ending session...');

        // Clean up auto-save
        if (autoSaveCleanup) {
            autoSaveCleanup();
            autoSaveCleanup = null;
        }

        // Remove stored data for current session
        if (sessionId) {
            removeSessionData(sessionId);
            log.session.info('Removed session data for:', sessionId);
        }

        // Reset analysis state
        resetAnalysis();

        // Clear session ID
        sessionId = null;

        log.session.info('Session ended and cleaned up');
    }

    /**
     * Force save current session data (useful before navigation or critical operations)
     */
    function forceSaveSession() {
        if (!sessionId) return;

        log.session.debug('Force saving session data...');
        sessionStorage.forceSaveCurrentSession(() => {
            const viewString = Object.keys(Views)[view] || 'start';
            return {
                analysisData: analysis,
                transcripts: [],
                realtimeTranscripts: realtimeTranscripts,
                texts: texts,
                view: viewString,
                models: models,
                language: getLanguageForAPI('session')
            };
        });
    }



    function testAnalyze() {
        resetAnalysis(); // Clear state before test
        
        texts = [
            'Dobrý den, pane doktore.', 
            'Mám bolesti v krku a horečku.', 
            'Co mi můžete doporučit?',
            'Od kdy pociťujete bolesti?',
            'Jak dlouho trvá horečka?',
            'Máte nějaké další příznaky?',
            'Nemohu polykat a mám bolesti hlavy už několik dní. Měřil jsem se předevčírem, když mi bylo už hodnš blbě a měl jsem třicet sedm devět.',
            'To už trochu polevilo, ale stále se necítím dobře.',
            'Teplota je stále vysoká a mám pocit, že se mi zhoršuje zrak.',
            'Tak se změříme teď hned. Vyrdžte mi.',
            'Třicet sedm šest. To je dost.',
            'Ukažte mi jazyk.',
            'Máte na něm bílý povlak. To vypadá na angínu',
            'Počkejte chvíli, ještě vám vezmu tlak. Máme se svélknout? Ne to je zbytečný, stačí, když si vyhrnete rukáv Jasně.',
            'sto dvacet sedm na osmdesát. To je v pořádku. Máte zánět hltanu a angínu. Dostanete antibiotika a budete muset zůstat doma.',
            'Dobře, děkuji. A co s tím zrakem?',
            'To je zřejmě způsobeno horečkou. Po vyléčení by to mělo ustoupit. Pokud ne, tak se vraťte.',
            'Doporučuji vám také hodně pít a odpočívat a předepíšu vám aspirin. Máte nějaké otázky? asi teď ne',
            'Kdyby se to zhoršilo, tak se hned vraťte. Případně mě můžete kontaktovat telefonicky. Když se to nezlepší do týdbe, tak se vraťte.',
            'Tak. jo. Děkuji. Na shledanou.',
            'Na shledanou.'
            
        ];
        analyzeTranscription();
    }


    let finalizeReportState = $state('idle');
    let report: any = $state(undefined);
    let finalReport: any = $state(undefined);
    let finalizationData: string = '';
    async function finalizeReport() {
        if (finalizeReportState === 'processing') {
            return;
        }
        
        // Force save before finalizing
        forceSaveSession();
        
        const currentState = JSON.stringify(analysis);
        if (finalizationData == currentState) {
            log.session.debug('current state...no need to finalize');
            view = Views.report;
            return;
        }
        finalizationData = currentState;

        finalizeReportState = 'processing';
        const analysisSnapshot = $state.snapshot(analysis);
        const toFinalize = {
            date: (new Date()).toISOString(),
            complaint: analysisSnapshot.complaint,
            symptoms: analysisSnapshot.symptoms,
            diagnosis: selectFinals(analysisSnapshot.diagnosis),
            treatment: selectFinals(analysisSnapshot.treatment),
            results: selectFinals(analysisSnapshot.results, 0),
            followUp: selectFinals(analysisSnapshot.followUp),
            medication: selectFinals(analysisSnapshot.medication),
            patient: $state.snapshot($profile),
            doctor: {}
        };

        log.session.debug('Finalized', toFinalize);
        const result = await fetch('/v1/med/session/finalize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                language: getLanguageForAPI('analysis'),
                text: JSON.stringify(toFinalize)
            })
        });
        report = await result.json();
        finalReport = report;
        report.doctor = 'doctor signature'

        log.session.debug($state.snapshot(report));
        view = Views.report;
        finalizeReportState = 'idle';
    }


    function copyReportText () {
        let text = '';
        for (const key in finalReport) {
            text += `${finalReport[key]}\r\n\n`;
        }
        navigator.clipboard.writeText(text);
    }

    function printReport() {
        window.print();
    }


    function selectFinals(objectArray: {
        pinned: boolean;
        [key: string]: any;
    }[], defaultCount: number = 1): {
        pinned: boolean;
        [key: string]: any;
    }[] {
        let final = objectArray.filter(o => o.pinned);
        if (final.length > 0) return final;
        if (defaultCount > 0) return objectArray.slice(0, defaultCount);
        return objectArray;
    }

    function backToAnalysis() {
        view = Views.analysis;
    }

    onMount(async () => {
        log.session.info('Session page mounted', { useRealtime, sessionId, currentView: view });
        
        // Try to restore session data from local storage first
        const restored = tryRestoreSessionData();
        if (restored) {
            log.session.info('Session data restored from local storage', {
                sessionId,
                currentView: view,
                analysisKeys: Object.keys(analysis),
                hasConversation: !!analysis.conversation
            });
            
            // Set up auto-save for the restored session
            if (sessionId) {
                setupSessionAutoSave(sessionId);
            }
        } else {
            log.session.info('No session data to restore - starting fresh');
        }
        
        // Add test function to verify backend is working
        (window as any).testSessionAPI = async () => {
            log.session.debug('Testing session API...');
            try {
                const response = await fetch('/v1/session/start', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        language: getLanguageForAPI('session'),
                        models: ['GP']
                    })
                });
                log.session.debug('Test response status:', response.status);
                const result = await response.json();
                log.session.debug('Test response data:', result);
                return result;
            } catch (error) {
                log.session.error('Test failed:', error);
                return error;
            }
        };
        
        log.session.debug('Added window.testSessionAPI() - call this in console to test backend');
        
        // Add test transcript functions in development mode
        try {
            const { 
                loadTestTranscript, 
                streamTestTranscript, 
                getAvailableTestTranscripts, 
                getTestTranscriptInfo 
            } = await import('$lib/session/testing/transcript-loader');
            
            // Make test functions available in console
            (window as any).testTranscripts = {
                // List available test transcripts
                list: getAvailableTestTranscripts,
                
                // Get info about a transcript
                info: getTestTranscriptInfo,
                
                // Load transcript data immediately
                load: loadTestTranscript,
                
                // Stream transcript with real-time simulation
                stream: async (transcriptName: string, options?: any) => {
                    log.session.debug('Starting test transcript stream...');
                    
                    // Reset current state with analysis merger
                    resetAnalysis();
                    
                    return streamTestTranscript(transcriptName as any, {
                        onTranscript: handleRealtimeTranscript,
                        onComplete: async () => {
                            log.session.debug('Test transcript streaming completed!');
                            log.session.debug('Triggering AI analysis...');
                            
                            // Wait a moment for UI to update
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                            // Trigger AI analysis using the legacy system
                            try {
                                await analyzeTranscription(ANALYZE_STEPS.transcript, true);
                                log.session.debug('AI analysis completed!');
                            } catch (error) {
                                log.session.error('AI analysis failed:', error);
                            }
                        },
                        delay: 1500, // Default 1.5 second delay
                        ...options
                    });
                },
                
                // Quick test with chest pain scenario
                chestpain: () => (window as any).testTranscripts.stream('chestpain'),
                
                // Stream with realistic timing
                realtimeStream: (transcriptName: string) => 
                    (window as any).testTranscripts.stream(transcriptName, { realTime: true }),
                
                // Load instantly without streaming
                instant: async (transcriptName: string) => {
                    log.session.debug('Loading test transcript instantly...');
                    
                    const transcripts = await loadTestTranscript(transcriptName as any);
                    
                    // Reset state with analysis merger
                    resetAnalysis();
                    
                    // Add all transcripts immediately
                    for (const transcript of transcripts) {
                        handleRealtimeTranscript(transcript);
                    }
                    
                    log.session.debug('Test transcript loaded instantly!');
                    log.session.debug('Triggering AI analysis...');
                    
                    // Wait a moment for UI to update
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Trigger AI analysis using the legacy system
                    try {
                        await analyzeTranscription(ANALYZE_STEPS.transcript, true);
                        log.session.debug('AI analysis completed!');
                    } catch (error) {
                        log.session.error('AI analysis failed:', error);
                    }
                }
            };
            
            log.session.debug('Test transcript functions added to window.testTranscripts:');
            log.session.debug('  📋 window.testTranscripts.list() - List available transcripts');
            log.session.debug('  ℹ️  window.testTranscripts.info("chestpain") - Get transcript info');
            log.session.debug('  🎬 window.testTranscripts.stream("chestpain") - Stream with delays');
            log.session.debug('  ⚡ window.testTranscripts.instant("chestpain") - Load instantly');
            log.session.debug('  🕐 window.testTranscripts.realtimeStream("chestpain") - Realistic timing');
            log.session.debug('  💨 window.testTranscripts.chestpain() - Quick chest pain test');
            log.session.debug('');
            log.session.debug('🔄 Analysis Functions:');
            log.session.debug('  🧪 window.triggerAnalysis() - Manual analysis trigger with merge stats');
            log.session.debug('  🔄 window.resetAnalysis() - Reset analysis merger state');
            log.session.debug('');
            log.session.debug('🌐 Language Configuration:');
            log.session.debug(`  Current UI Language: ${UI_LANGUAGE === 'en' ? 'English' : 'Czech'}`);
            log.session.debug(`  Analysis Language: ${getLanguageForAPI('analysis')}`);
            log.session.debug('  To change language, modify UI_LANGUAGE in session page');
            log.session.debug('  🔍 window.checkLanguage() - Check current language settings');
            log.session.debug('  🧪 window.testAnalysisLanguage("english") - Test analysis language');
            log.session.debug('  🧪 window.testAnalysisLanguage("czech") - Test analysis in Czech');
            log.session.debug('');
            log.session.debug('📊 Analysis Merger: Gradual refinement active - items will accumulate and refine instead of jumping!');
            
            // Add manual analysis trigger for testing
            (window as any).triggerAnalysis = async () => {
                log.session.debug('Manual analysis trigger...');
                try {
                    await analyzeTranscription(ANALYZE_STEPS.transcript, true);
                    log.session.debug('Manual analysis completed!');
                } catch (error) {
                    log.session.error('Manual analysis failed:', error);
                }
            };

            // Add session management functions for testing/debugging
            (window as any).sessionUtils = {
                // Force save current session
                forceSave: forceSaveSession,
                
                // End current session and cleanup
                endSession: endSession,
                
                // Check if session has stored data
                hasStoredData: (id?: string) => hasStoredSessionData(id || sessionId || ''),
                
                // Try to restore session data
                tryRestore: (id?: string) => tryRestoreSessionData(id),
                
                // Get current session info
                getCurrentSession: () => ({
                    sessionId,
                    hasRestoredData,
                    dataRestoredFromSessionId,
                    autoSaveActive: autoSaveCleanup !== null,
                    view: Object.keys(Views)[view] || 'unknown',
                    analysisKeys: Object.keys(analysis),
                    transcriptCount: texts.length,
                    realtimeTranscriptCount: realtimeTranscripts.length
                }),
                
                // Debug localStorage state
                debugStorage: () => {
                    const sessions = sessionStorage.getStoredSessions();
                    log.session.debug('Debug Storage State:');
                    log.session.debug('- Available sessions:', sessions);
                    log.session.debug('- Current sessionId:', sessionId);
                    log.session.debug('- Current view:', Object.keys(Views)[view] || 'unknown');
                    log.session.debug('- Has restored data:', hasRestoredData);
                    log.session.debug('- Analysis keys:', Object.keys(analysis));
                    log.session.debug('- Texts length:', texts.length);
                    log.session.debug('- Realtime transcripts:', realtimeTranscripts.length);
                    
                    sessions.forEach(id => {
                        const data = loadSessionData(id);
                        if (data) {
                            log.session.debug(`📋 Session ${id.substring(0, 8)}:`, {
                                view: data.view,
                                lastUpdated: new Date(data.lastUpdated).toLocaleString(),
                                analysisKeys: Object.keys(data.analysisData),
                                textsCount: data.texts.length,
                                transcriptsCount: data.realtimeTranscripts.length
                            });
                        }
                    });
                },
                
                // Clear all stored sessions (use with caution)
                clearAll: () => {
                    const confirmed = confirm('Are you sure you want to clear ALL stored session data?');
                    if (confirmed) {
                        sessionStorage.clearAllSessions();
                        log.session.debug('All session data cleared');
                    }
                }
            };

            log.session.debug('Session management functions added:');
            log.session.debug('  📊 window.sessionUtils.getCurrentSession() - Get current session info');
            log.session.debug('  💾 window.sessionUtils.forceSave() - Force save current session');
            log.session.debug('  🏁 window.sessionUtils.endSession() - End and cleanup session');
            log.session.debug('  🔍 window.sessionUtils.hasStoredData(sessionId?) - Check for stored data');
            log.session.debug('  📂 window.sessionUtils.tryRestore(sessionId?) - Try restore data');
            log.session.debug('  🔍 window.sessionUtils.debugStorage() - Debug localStorage state');
            log.session.debug('  🧹 window.sessionUtils.clearAll() - Clear all stored data (with confirmation)');
            log.session.debug('');
            log.session.debug('🔧 Debugging tip: If session restoration is not working:');
            log.session.debug('  1. Run window.sessionUtils.debugStorage() to see stored sessions');
            log.session.debug('  2. Run window.sessionUtils.tryRestore() to manually restore');
            log.session.debug('  3. Check the console for restoration logs starting with 🔍 or 📂');

            // Add language check function
            (window as any).checkLanguage = () => {
                log.session.debug('Language Configuration Check:');
                log.session.debug(`  UI_LANGUAGE: ${UI_LANGUAGE}`);
                log.session.debug(`  Session API Language: ${getLanguageForAPI('session')}`);
                log.session.debug(`  Analysis API Language: ${getLanguageForAPI('analysis')}`);
                log.session.debug('');
                log.session.debug('💡 To change language, update UI_LANGUAGE in the session page:');
                log.session.debug(`  const UI_LANGUAGE = 'en'; // Change to 'cs' for Czech`);
                return {
                    ui: UI_LANGUAGE,
                    session: getLanguageForAPI('session'),
                    analysis: getLanguageForAPI('analysis')
                };
            };

            // Add test analysis function with specific language
            (window as any).testAnalysisLanguage = async (language = 'english') => {
                log.session.debug(`🧪 Testing analysis with language: ${language}`);
                
                const testText = `
                Doctor: Hello, what brings you here today?
                Patient: I have been experiencing chest pain for the past two days.
                Doctor: Can you describe the pain? Is it sharp or dull?
                Patient: It's a dull ache that gets worse when I eat spicy food.
                Doctor: This sounds like it could be acid reflux. I recommend avoiding spicy foods and taking antacids.
                `;

                try {
                    const response = await fetch('/v1/med/session', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            language: language,
                            type: ANALYZE_STEPS.diagnosis,
                            models: ['GP'],
                            text: testText
                        })
                    });
                    
                    const result = await response.json();
                    log.session.debug('Analysis Result:', result);
                    log.session.debug('Treatment suggestions language check:');
                    if (result.treatment && result.treatment.length > 0) {
                        result.treatment.forEach((treatment: any, index: number) => {
                            log.session.debug(`  ${index + 1}. "${treatment.description}"`);
                        });
                    }
                    return result;
                } catch (error) {
                    log.session.error('Analysis test failed:', error);
                    return error;
                }
            };
        } catch (error) {
            log.session.debug('Test transcript functions not available (production mode)');
        }
        
        // Log initial state
        log.session.debug('Initial session state:', {
            view,
            useRealtime,
            sessionId,
            models: $state.snapshot(models).filter(m => m.active).map(m => m.name),
            audioState
        });
    });

    onDestroy(() => {
        log.session.debug('Session page destroying...');
        
        // Force save before component destruction
        forceSaveSession();
        
        // Clean up auto-save if it's running
        if (autoSaveCleanup) {
            autoSaveCleanup();
            autoSaveCleanup = null;
        }
        
        log.session.debug('Session page cleanup complete');
    });


</script>


<!-- Session Restoration Notification -->
{#if hasRestoredData && dataRestoredFromSessionId}
    <div class="session-restoration-notice">
        <div class="notice-content">
            <svg class="notice-icon">
                <use href="/icons.svg#restore"></use>
            </svg>
            <div class="notice-text">
                <strong>{$t('session.blocks.session-restored')}</strong>
                <span>{$t('session.blocks.session-restored-description')} (Session: {dataRestoredFromSessionId.substring(0, 8)}...)</span>
            </div>
            <button class="notice-dismiss" onclick={() => { hasRestoredData = false; dataRestoredFromSessionId = null; }} aria-label={$t('aria.session.dismiss-notification')}>
                <svg>
                    <use href="/icons.svg#x"></use>
                </svg>
            </button>
        </div>
    </div>
{/if}

{#if view !== Views.report}
    <div class="audio-recorder" class:-running={view != Views.start} class:-active={audioState === AudioState.Listening || audioState === AudioState.Speaking}>
        <AudioButton 
            bind:speechChunks={speechChunks} 
            bind:state={audioState}
            bind:sessionId={sessionId as any}
            useRealtime={useRealtime}
            language={getLanguageForAPI('session')}
            models={models.filter(m => m.active).map(m => m.name)}
            onspeechstart={() => {
                newSpeech = true;
            }}
            onspeechend={({ speechChunks }) => {
                if (!useRealtime) {
                    log.session.debug('Speech ended with chunks:', speechChunks.length);
                    processData();
                }
            }}
            onfeatures={(features) => {
                // Handle audio features if needed
            }}
            ontranscript={handleRealtimeTranscript}
            onanalysis={handleRealtimeAnalysis}
            onsessioncreated={(createdSessionId) => {
                log.session.debug('Session created callback received:', createdSessionId);
                sessionId = createdSessionId;
                
                // Set up auto-saving for the new session
                setupSessionAutoSave(createdSessionId);
            }}
        />
    </div>
{/if}
<div class="models">
<Models models={models} {activeModels} />
</div>

{#if view === Views.start}
    <div class="canvas canvas-start">
        <div>
            <button class="uhint" onclick={testAnalyze} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); testAnalyze(); } }} aria-label={$t('aria.session.test-analysis')}>
                {#if audioState === AudioState.Listening || audioState === AudioState.Speaking}
                    {$t('session.blocks.listening')}
                {:else}
                    {$t('session.blocks.start-recording')}
                {/if}
            </button>

        </div>
    </div>
{:else if view === Views.analysis}
    <div class="canvas canvas-analysis">
        {#if hasResults}
            <div class="session">
                <div class="p-title">
                        <svg>
                            <use href="/icons-o.svg#diagnosis"></use>
                        </svg>
                        <h3 class="h3">{$t('session.blocks.assisted-analysis')}</h3>
                        {#if finalizeReportState === 'processing'}
                            <div class="loader">
                                <div>{$t('session.blocks.finalizing')}</div> <LoaderThinking />
                            </div>
                        {:else}
                            <button class="button -primary" onclick={finalizeReport}>{$t('session.blocks.finalize-report')}</button>
                        {/if}

                        <!-- Session Management Controls -->
                        <button class="button -danger" onclick={() => {
                            const confirmed = confirm($t('session.blocks.end-session-confirm'));
                            if (confirmed) {
                                endSession();
                            }
                        }}>{$t('session.blocks.end-session')}</button>

                </div>
                <div class="dashboard">
                    {#if analysis}
                        <Diagnosis bind:analysis={analysis} />
                    {/if}
                </div>
            </div>

            <div class="transcript">
                <div class="p-title">
                    <svg>
                        <use href="/icons-o.svg#transcript"></use>
                    </svg>
                    <h3 class="h3">{$t('session.blocks.transcript')}</h3>
                </div>

                {#if analysis && analysis.conversation}
                    <Transcript conversation={analysis.conversation} {newSpeech}/>
                {/if}


            </div>
        
        {/if}
    </div>
{:else if view == Views.report}
    <div class="canvas canvas-report">
        <div>
            <div class="p-title">
                <svg>
                    <use href="/icons-o.svg#report"></use>
                </svg>
                <h3 class="h3">{$t('session.blocks.report')}</h3>
                <button class="button" onclick={backToAnalysis}>{$t('session.blocks.back')}</button>
                <button class="button" onclick={copyReportText}>{$t('session.blocks.copy')}</button>
                <button class="button" onclick={printReport}>{$t('session.blocks.print')}</button>
                <button class="button -primary">{$t('session.blocks.save')}</button>
            </div>
            <div class="report-background">
                <div class="report-page">
                    <Report report={report} bind:finalReport={finalReport}/>
                </div>
            </div>

        </div>
    </div>
{/if}
<style>

    .audio-recorder {
        position: fixed;
        display: flex;
        justify-content: center;
        align-items: center;
        bottom: calc(40% + 3rem);
        width: 60vw;
        height: 60vw;
        left: 50%;
        transform: translate(-50%, calc(50% - 3rem));
        z-index: 1001;
        pointer-events: none;
        transition: bottom .3s, left .3s, z-index .1s;
        transition-timing-function: ease-in;
    }
    .audio-recorder.-active {
        z-index: 200000;
    }
    .audio-recorder.-running {
        left: calc(100% / 6 * 5);
        bottom: 1.5rem;
    }

    /* Adjust position when viewer is open */
    :global(main.layout.-viewer) .audio-recorder {
        left: calc(33vw + 67vw / 2); /* Viewer width + half of remaining content width */
    }
    :global(main.layout.-viewer) .audio-recorder.-running {
        left: calc(33vw + 67vw / 6 * 5); /* Adjust running position for viewer */
    }

    .canvas-analysis {
        display: grid;
        grid-template-columns: 4fr 2fr;
        gap: var(--gap);
    }
    .canvas > * {
        margin: var(--gap) 0;
        background-color: var(--color-gray-300);
        height: calc(100vh - 2 * var(--gap) -  var(--toolbar-height) - 4rem); /* TODO: 4rem for models */
        container-type: inline-size;
        padding-bottom: 2rem;
        overflow: auto;
    }
    .transcript {
        overflow: hidden;
    }


    .report-background {
        padding: 1rem;
        min-height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .report-page {
        background-color: var(--color-white);
        margin: 0 auto;
        width: 100%;
        max-width: 800px;
        aspect-ratio: 1/1.414;
        box-shadow: 0 .5rem 1rem 0 var(--color-gray-800);
    }

    .session {
        container-type: inline-size;
        container-name: session;
    }

    /* Session Restoration Notification Styles */
    .session-restoration-notice {
        position: fixed;
        top: 1rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        color: white;
        border-radius: var(--radius-8);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        padding: 1rem 1.5rem;
        max-width: 500px;
        width: 90vw;
        animation: slideInFromTop 0.5s ease-out;
    }

    .notice-content {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .notice-icon {
        width: 1.5rem;
        height: 1.5rem;
        fill: currentColor;
        flex-shrink: 0;
    }

    .notice-text {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .notice-text strong {
        font-weight: 600;
        font-size: 0.95rem;
    }

    .notice-text span {
        font-size: 0.85rem;
        opacity: 0.9;
    }

    .notice-dismiss {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        border-radius: var(--radius-4);
        padding: 0.5rem;
        cursor: pointer;
        transition: background-color 0.2s ease;
        flex-shrink: 0;
    }

    .notice-dismiss:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    .notice-dismiss svg {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
    }

    @keyframes slideInFromTop {
        from {
            transform: translateX(-50%) translateY(-100%);
            opacity: 0;
        }
        to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
                 }
     }

    .dashboard {
        margin-top: 1rem;
        column-gap: 0;
    }
    
    @container session (min-width: 800px) {
        .dashboard {
            /*display: grid;
            grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
            gap: var(--gap);*/
            columns: 2;
        }
    }
    @container session (min-width: 1200px) {
        .dashboard {
            columns: 3;
        }
    }


    .canvas-start > * {
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 2rem;
    }
    .canvas-start .uhint {
        padding-top: 12rem;
        color: var(--color-blue);
    }

    @media print {
        @page  {
            size: auto;   /* auto is the initial value */
            margin: 0mm;  /* this affects the margin in the printer settings */
        }
        :global(body) {
            background-color: #FFF !important;
            margin: 1.6cm !important; 
        }
        :global(header),
        :global(footer),
        .models,
        .canvas .p-title { 
            display: none !important;
        }
        :global(main),
        .report-background,
        .canvas > * {
            padding: 0 !important;
            margin: 0 !important;
            height: auto;
            background-color: none;
        }
        .canvas {
            margin: 0;
            padding: 0;
            height: auto;
            overflow: visible;
            background-color: none;
        }
        .report-page {
            width: 100%;
            box-shadow: none;
        }

    }
</style>