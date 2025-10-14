import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { NumberSequenceQuestion, FillInTheBlanksQuestion, RuleDetectiveQuestion, SortSequenceQuestion } from '../../../types';
import { useAudio } from '../../contexts/AudioContext';
import { theme } from '../../config/theme';
import { QuestionComponentProps } from './QuestionProps';
import CustomNumpad from '../shared/CustomNumpad';
import { SoundKey } from '../../audio/audioAssets';


// --- Helper to render the styled prompt ---
const StyledPrompt: React.FC<{ text: string, onAudioClick?: () => void, isAudioPlaying?: boolean }> = ({ text, onAudioClick, isAudioPlaying }) => {
    const parts = text.split(/<strong>(.*?)<\/strong>/);

    const audioButton = onAudioClick && (
        <button onClick={onAudioClick} className="ml-2 text-2xl md:text-3xl text-sky-500 hover:text-sky-700 transition-transform transform hover:scale-110 relative" aria-label="Nghe lại hướng dẫn">
            🔊
            {isAudioPlaying && (
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-8 w-8 bg-sky-500 opacity-50"></span>
                </span>
            )}
        </button>
    );

    const content = parts.length === 3 ? (
        <>
            {parts[0]}
            <strong className="text-pink-600">{parts[1]}</strong>
            {parts[2]}
        </>
    ) : <>{text}</>;

    return (
        <div className="flex items-center justify-center">
            <span>{content}</span>
            {audioButton}
        </div>
    );
};

const getRuleSoundKey = (step: number, variant: 'fill_blanks' | 'rule_detective'): SoundKey | null => {
    if (variant === 'fill_blanks') {
        switch (step) {
            case 1: return 'PROMPT_FILL_BLANKS_STEP2_USE_RULE_PLUS_1';
            case -1: return 'PROMPT_FILL_BLANKS_STEP2_USE_RULE_MINUS_1';
            case 2: return 'PROMPT_FILL_BLANKS_STEP2_USE_RULE_PLUS_2';
            case -2: return 'PROMPT_FILL_BLANKS_STEP2_USE_RULE_MINUS_2';
            default: return null;
        }
    } else { // rule_detective
        switch (step) {
            case 1: return 'PROMPT_RD_STEP2_CHECK_PLUS_1';
            case -1: return 'PROMPT_RD_STEP2_CHECK_MINUS_1';
            case 2: return 'PROMPT_RD_STEP2_CHECK_PLUS_2';
            case -2: return 'PROMPT_RD_STEP2_CHECK_MINUS_2';
            default: return null;
        }
    }
};


// --- Rule Detective Component (New flow based on user feedback) ---
const RuleDetectiveDisplay: React.FC<QuestionComponentProps<RuleDetectiveQuestion>> = ({ question, onAnswer, disabled }) => {
  type Phase = 'INTRO' | 'FIND_RULE' | 'CHECK_SEQUENCE' | 'FIX_ERROR' | 'COMPLETE';
  type CheckResult = 'correct' | 'incorrect' | null;

  const [phase, setPhase] = useState<Phase>('INTRO');
  const [selectedRule, setSelectedRule] = useState<{ display: string; step: number } | null>(null);
  const [checkIndex, setCheckIndex] = useState(0);
  const [correction, setCorrection] = useState<string>('');
  const [errorIndex, setErrorIndex] = useState<number | null>(null);
  const [wrongRuleAttempts, setWrongRuleAttempts] = useState<Record<string, 'wrong'>>({});
  const [explanation, setExplanation] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  
  const [isAnimatingCheck, setIsAnimatingCheck] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult>(null);
  const [arrowCoords, setArrowCoords] = useState<{ x1: number, y1: number, x2: number, y2: number, midX: number, midY: number, pathLength: number } | null>(null);

  const sequenceContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  itemRefs.current = [];

  const { playSound, playPrompt, playPromptAndWait, cancelPrompt, isPromptPlaying } = useAudio();
  const currentPromptKeyRef = useRef<SoundKey | SoundKey[] | null>(null);

  const playAndSetCurrentPrompt = useCallback((keys: SoundKey[]) => {
      currentPromptKeyRef.current = keys;
      playPrompt(keys);
  }, [playPrompt]);

  useEffect(() => {
    setPhase('INTRO');
    setSelectedRule(null);
    setCheckIndex(0);
    setCorrection('');
    setErrorIndex(null);
    setWrongRuleAttempts({});
    setExplanation('');
    setIsShaking(false);
    setIsAnimatingCheck(false);
    setCheckResult(null);
    setArrowCoords(null);
    
    return () => { cancelPrompt(); };
  }, [question.id, cancelPrompt]);

  useEffect(() => {
    if (disabled || phase === 'COMPLETE') return; // Don't play prompts on complete phase, as it's handled by async function
    let promptKeys: SoundKey[] | null = null;
    switch (phase) {
        case 'INTRO': promptKeys = ['PROMPT_RD_INTRO']; break;
        case 'FIND_RULE': promptKeys = ['PROMPT_RD_STEP1_RULE']; break;
        case 'CHECK_SEQUENCE': 
            if (selectedRule) {
              const key = getRuleSoundKey(selectedRule.step, 'rule_detective');
              if (key) promptKeys = [key];
            }
            break;
        case 'FIX_ERROR': 
            promptKeys = ['PROMPT_RD_STEP3_FOUND_ERROR', 'PROMPT_RD_STEP4_CORRECT'];
            break;
    }
    if (promptKeys) playAndSetCurrentPrompt(promptKeys);
  }, [phase, selectedRule, playAndSetCurrentPrompt, disabled]);

  useLayoutEffect(() => {
      if (phase !== 'CHECK_SEQUENCE' || !selectedRule) {
          setArrowCoords(null);
          return;
      };

      const container = sequenceContainerRef.current;
      const startEl = itemRefs.current[checkIndex];
      const endEl = itemRefs.current[checkIndex + 1];

      if (container && startEl && endEl) {
          const containerRect = container.getBoundingClientRect();
          const startRect = startEl.getBoundingClientRect();
          const endRect = endEl.getBoundingClientRect();

          const x1 = startRect.left + startRect.width / 2 - containerRect.left;
          const y1 = startRect.top - containerRect.top - 10;
          const x2 = endRect.left + endRect.width / 2 - containerRect.left;
          const y2 = y1;

          const midX = (x1 + x2) / 2;
          const midY = y1;

          const dx = x2 - x1;
          const pathLength = Math.abs(dx);

          setArrowCoords({ x1, y1, x2, y2, midX, midY, pathLength });
      }
  }, [checkIndex, phase, selectedRule, isAnimatingCheck]);

  const handleRuleSelect = (rule: { display: string; step: number }) => {
    if (disabled || phase !== 'FIND_RULE') return;
    if (rule.step === question.rule.step) {
      playSound('CORRECT_ANSWER');
      setSelectedRule(rule);
      setPhase('CHECK_SEQUENCE');
    } else {
      playSound('WRONG_ANSWER');
      setWrongRuleAttempts(prev => ({ ...prev, [rule.display]: 'wrong' }));
      setTimeout(() => setWrongRuleAttempts(prev => {
          const newState = {...prev};
          delete newState[rule.display];
          return newState;
      }), 500);
    }
  };
  
  const handleCheck = () => {
    if (disabled || phase !== 'CHECK_SEQUENCE' || !selectedRule || isAnimatingCheck) return;
    cancelPrompt();
    const isCorrect = question.sequenceWithErrors[checkIndex] + selectedRule.step === question.sequenceWithErrors[checkIndex + 1];

    setIsAnimatingCheck(true);
    setCheckResult(isCorrect ? 'correct' : 'incorrect');
    playSound(isCorrect ? 'SEQUENCE_ITEM_POP' : 'WRONG_ANSWER');

    setTimeout(() => {
        if (isCorrect) {
            setCheckIndex(prev => prev + 1);
            setIsAnimatingCheck(false);
            setCheckResult(null);
        } else {
            const foundErrorIndex = checkIndex + 1;
            const correctValue = question.errors[foundErrorIndex];
            const prevValue = question.sequenceWithErrors[checkIndex];
            setExplanation(`Aha! Số này sai rồi! Vì ${prevValue} ${selectedRule.display} phải bằng ${correctValue} cơ.`);
            setErrorIndex(foundErrorIndex);
            setPhase('FIX_ERROR');
        }
    }, 1800);
  };

  const handleFixSubmit = async () => {
    if (disabled || errorIndex === null || correction === '') return;
    cancelPrompt();
    const correctValue = question.errors[errorIndex];
    if (parseInt(correction, 10) === correctValue) {
      setPhase('COMPLETE');
      await playPromptAndWait(['PROMPT_CORRECT_GREAT_JOB']);
      onAnswer(true);
    } else {
      playSound('WRONG_ANSWER');
      setIsShaking(true);
      setTimeout(() => {
          setIsShaking(false);
          setCorrection('');
      }, 500);
    }
  };
  
  const handleReplayPrompt = () => {
      if (currentPromptKeyRef.current) {
          playPrompt(Array.isArray(currentPromptKeyRef.current) ? currentPromptKeyRef.current : [currentPromptKeyRef.current]);
      }
  };

  if (phase === 'INTRO') {
      return (
          <div className="flex flex-col items-center w-full gap-4 animate-pop-scale">
              <StyledPrompt text="Trong dãy số này có một lỗi sai. Bé hãy làm thám tử để tìm ra nhé!" onAudioClick={handleReplayPrompt} isAudioPlaying={isPromptPlaying}/>
              <div className="flex items-center justify-center gap-3 p-3 bg-sky-100 rounded-lg">
                  {question.sequenceWithErrors.map((num, i) => (
                      <span key={i} className={`text-4xl md:text-5xl font-bold ${theme.colors.text.operand}`}>{num}</span>
                  ))}
              </div>
              <button onClick={() => { playSound('BUTTON_CLICK'); setPhase('FIND_RULE'); }} className={`${theme.buttons.base} ${theme.buttons.primary}`}>Bắt đầu</button>
          </div>
      );
  }

  if (phase === 'FIND_RULE') {
    return (
      <div className="flex flex-col items-center w-full gap-4 animate-pop-scale">
        <StyledPrompt text="Bước 1: Quy luật của dãy số là gì?" onAudioClick={handleReplayPrompt} isAudioPlaying={isPromptPlaying}/>
        <div className="flex items-center justify-center gap-3 p-3 bg-sky-100 rounded-lg">
          {question.sequenceWithErrors.slice(0, 3).map((num, i) => (
            <React.Fragment key={i}>
              <span className={`text-4xl md:text-5xl font-bold ${theme.colors.text.operand}`}>{num}</span>
              {i < 2 && <span className="text-3xl text-gray-400">,</span>}
            </React.Fragment>
          ))}
          <span className="text-4xl md:text-5xl font-bold text-gray-400">...</span>
        </div>
        <div className="flex justify-center gap-3 mt-4">
          {question.ruleOptions.map(opt => (
            <button
              key={opt.display}
              onClick={() => handleRuleSelect(opt)}
              disabled={disabled}
              className={`px-6 py-4 text-3xl font-bold rounded-lg shadow-md transition-transform transform hover:scale-105 bg-yellow-200 hover:bg-yellow-300 text-yellow-800
                ${wrongRuleAttempts[opt.display] === 'wrong' ? 'animate-shake-short bg-red-300' : ''}`}
            >
              {opt.display}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'CHECK_SEQUENCE') {
    const promptWithHTML = `Bước 2: Dùng quy luật <strong>${selectedRule?.display || ''}</strong> để kiểm tra nhé!`;

    return (
      <div className="flex flex-col items-center w-full gap-4 animate-pop-scale">
        <StyledPrompt text={promptWithHTML} onAudioClick={handleReplayPrompt} isAudioPlaying={isPromptPlaying} />
         <div ref={sequenceContainerRef} className="flex flex-wrap items-center justify-center gap-2 p-4 bg-sky-100 rounded-lg relative min-h-[100px] w-full max-w-2xl">
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none" aria-hidden="true">
                {isAnimatingCheck && arrowCoords && (
                    <svg className="w-full h-full text-pink-500" overflow="visible">
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" className="fill-current" />
                            </marker>
                        </defs>
                        <path
                            className="animate-draw-line"
                            d={`M ${arrowCoords.x1} ${arrowCoords.y1} L ${arrowCoords.x2} ${arrowCoords.y2}`}
                            stroke="currentColor"
                            strokeWidth="3"
                            fill="none"
                            markerEnd="url(#arrowhead)"
                            style={{ '--path-length': arrowCoords.pathLength } as React.CSSProperties}
                        />
                        <text
                            x={arrowCoords.midX}
                            y={arrowCoords.midY - 15}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="text-2xl font-bold fill-current animate-pop-in"
                            style={{ animationDelay: '0.4s', opacity: 0 }}
                        >
                            {selectedRule?.display}
                        </text>
                        {checkResult && (
                            <text
                                x={arrowCoords.midX}
                                y={arrowCoords.midY + 25}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="text-4xl animate-pop-in"
                                style={{ animationDelay: '0.7s', opacity: 0 }}
                            >
                                {checkResult === 'correct' ? '✅' : '❌'}
                            </text>
                        )}
                    </svg>
                )}
            </div>
            {question.sequenceWithErrors.map((num, i) => (
                <div 
                    key={i}
                    ref={el => { itemRefs.current[i] = el }}
                    className={`w-14 h-14 md:w-16 md:h-16 flex items-center justify-center text-3xl md:text-4xl font-bold rounded-md bg-white shadow transition-all duration-300 
                    ${isAnimatingCheck && (i === checkIndex || i === checkIndex + 1) ? `scale-110 ring-2 ${checkResult === 'correct' ? 'ring-green-400' : 'ring-red-400'}` : ''}
                    ${checkIndex > i ? 'bg-green-100' : ''}
                `}>
                    {num}
                </div>
            ))}
         </div>
         <button onClick={handleCheck} disabled={isAnimatingCheck || disabled} className={`${theme.buttons.base} ${theme.buttons.primary}`}>Kiểm tra</button>
      </div>
    );
  }
  
  if (phase === 'FIX_ERROR' || phase === 'COMPLETE') {
      const promptText = phase === 'COMPLETE' ? "Chính xác! Bé giỏi quá!" : "Bước 4: Bé hãy điền đáp án đúng nhé";
      return (
          <div className="flex flex-col items-center w-full gap-4">
            <StyledPrompt text={promptText} onAudioClick={phase === 'COMPLETE' ? undefined : handleReplayPrompt} isAudioPlaying={isPromptPlaying}/>
            {phase === 'FIX_ERROR' && explanation && 
              <div className="bg-yellow-100 border-l-4 border-yellow-400 text-yellow-800 p-3 rounded-r-lg shadow-md text-center text-base md:text-lg">
                <p>💡 {explanation}</p>
              </div>
            }
            <div className="flex flex-wrap items-center justify-center gap-1 p-2 bg-sky-100 rounded-lg">
                {question.sequenceWithErrors.map((num, i) => (
                    <React.Fragment key={i}>
                        {i === errorIndex ? (
                             <div className={`w-16 h-16 md:w-20 md:h-20 flex items-center justify-center text-4xl md:text-5xl font-bold rounded-md shadow-inner
                                ${isShaking ? 'animate-shake-short' : ''}
                                ${phase === 'COMPLETE' ? 'bg-green-200 text-green-800' : `bg-yellow-100 ring-2 ring-pink-500 text-pink-600`}`}>
                                 {phase === 'COMPLETE' ? question.errors[errorIndex!] : (correction || '?')}
                             </div>
                        ) : (
                             <div className="w-14 h-14 md:w-16 md:h-16 flex items-center justify-center text-3xl md:text-4xl font-bold rounded-md bg-white shadow">
                               {phase === 'COMPLETE' ? question.fullSequence[i] : num}
                             </div>
                        )}
                    </React.Fragment>
                ))}
            </div>
            {!disabled && phase === 'FIX_ERROR' && <CustomNumpad onInput={(n) => setCorrection(c => c.length < 2 ? c+n : c)} onDelete={() => setCorrection(c => c.slice(0,-1))} onEnter={handleFixSubmit} />}
          </div>
      );
  }

  return null;
};


// --- Fill In The Blanks Component ---
const FillInTheBlanksDisplay: React.FC<QuestionComponentProps<FillInTheBlanksQuestion>> = ({ question, onAnswer, disabled }) => {
    type Step = 'FIND_RULE' | 'FILL_BLANKS' | 'COMPLETE';

    const [step, setStep] = useState<Step>('FIND_RULE');
    const [selectedRule, setSelectedRule] = useState<{ display: string; step: number } | null>(null);
    const [inputValues, setInputValues] = useState<string[]>([]);
    const [activeIndex, setActiveIndex] = useState(0); 
    const [wrongRuleAttempts, setWrongRuleAttempts] = useState<Record<string, 'wrong'>>({});
    const [isShaking, setIsShaking] = useState(false);
    
    const { playSound, playPrompt, playPromptAndWait, cancelPrompt, isPromptPlaying } = useAudio();
    const currentPromptKeyRef = useRef<SoundKey | SoundKey[] | null>(null);
    const blankIndicesRef = useRef<number[]>([]);
    
    const playAndSetCurrentPrompt = useCallback((keys: SoundKey[]) => {
        currentPromptKeyRef.current = keys;
        playPrompt(keys);
    }, [playPrompt]);

    useEffect(() => {
        setStep('FIND_RULE');
        setSelectedRule(null);
        setWrongRuleAttempts({});

        const blanks = question.sequence.map((val, idx) => val === null ? idx : -1).filter(idx => idx !== -1);
        blankIndicesRef.current = blanks;

        setInputValues(Array(blanks.length).fill(''));
        setActiveIndex(0);
        setIsShaking(false);
        
        return () => { cancelPrompt(); }

    }, [question.id, question.sequence, cancelPrompt]);
    
    useEffect(() => {
        if (disabled || step === 'COMPLETE') return;
        let promptKeys: SoundKey[] | null = null;
        switch (step) {
            case 'FIND_RULE': promptKeys = ['PROMPT_FILL_BLANKS_STEP1_RULE']; break;
            case 'FILL_BLANKS': 
                if (selectedRule) {
                    const key = getRuleSoundKey(selectedRule.step, 'fill_blanks');
                    if(key) promptKeys = [key];
                }
                break;
        }
        if (promptKeys) playAndSetCurrentPrompt(promptKeys);
    }, [step, selectedRule, playAndSetCurrentPrompt, disabled]);
    
    const handleReplayPrompt = () => {
        if (currentPromptKeyRef.current) {
            playPrompt(Array.isArray(currentPromptKeyRef.current) ? currentPromptKeyRef.current : [currentPromptKeyRef.current]);
        }
    };

    const handleRuleSelect = (rule: { display: string; step: number }) => {
        if (disabled || step !== 'FIND_RULE') return;
        
        if (rule.step === question.rule.step) {
            playSound('CORRECT_ANSWER');
            setSelectedRule(rule);
            setStep('FILL_BLANKS');
        } else {
            playSound('WRONG_ANSWER');
            setWrongRuleAttempts(prev => ({ ...prev, [rule.display]: 'wrong' }));
            setTimeout(() => setWrongRuleAttempts(prev => {
                const newState = {...prev};
                delete newState[rule.display];
                return newState;
            }), 500);
        }
    };

    const handleNumpadInput = (num: string) => {
        if (disabled || step !== 'FILL_BLANKS') return;
        playSound('TYPE');
        const newInputValues = [...inputValues];
        const currentVal = newInputValues[activeIndex] || '';
        if (currentVal.length < 2) {
            newInputValues[activeIndex] = currentVal + num;
            setInputValues(newInputValues);
        }
    };
    
    const handleNumpadDelete = () => {
        if (disabled || step !== 'FILL_BLANKS') return;
        playSound('TYPE');
        const newInputValues = [...inputValues];
        newInputValues[activeIndex] = (newInputValues[activeIndex] || '').slice(0, -1);
        setInputValues(newInputValues);
    };

    const handleNumpadSubmit = async () => {
        if (disabled || step !== 'FILL_BLANKS' || inputValues[activeIndex].trim() === '') return;
        
        const currentValue = parseInt(inputValues[activeIndex], 10);
        const correctAnswer = question.answers[activeIndex];

        if (currentValue === correctAnswer) {
            playSound('SEQUENCE_ITEM_POP');
            if (activeIndex < question.answers.length - 1) {
                setActiveIndex(activeIndex + 1);
            } else {
                setStep('COMPLETE');
                await playPromptAndWait(['PROMPT_CORRECT_GREAT_JOB']);
                onAnswer(true);
            }
        } else {
            playSound('WRONG_ANSWER');
            setIsShaking(true);
            setTimeout(() => {
                setIsShaking(false);
                const newInputValues = [...inputValues];
                newInputValues[activeIndex] = '';
                setInputValues(newInputValues);
            }, 500);
        }
    };

    if (step === 'FIND_RULE') {
        return (
            <div className="flex flex-col items-center w-full gap-4 animate-pop-scale">
                <StyledPrompt text="Bước 1: Quy luật của dãy số là gì?" onAudioClick={handleReplayPrompt} isAudioPlaying={isPromptPlaying}/>
                <div className="flex items-center justify-center gap-3 p-3 bg-sky-100 rounded-lg">
                    {question.fullSequence.slice(0, 3).map((num, i) => (
                        <React.Fragment key={i}>
                            <span className={`text-4xl md:text-5xl font-bold ${theme.colors.text.operand}`}>{num}</span>
                            {i < 2 && <span className="text-3xl text-gray-400">,</span>}
                        </React.Fragment>
                    ))}
                    <span className="text-4xl md:text-5xl font-bold text-gray-400">...</span>
                </div>
                <div className="flex justify-center gap-3 mt-4">
                    {question.ruleOptions.map(opt => (
                        <button
                            key={opt.display}
                            onClick={() => handleRuleSelect(opt)}
                            disabled={disabled}
                            className={`px-6 py-4 text-3xl font-bold rounded-lg shadow-md transition-transform transform hover:scale-105 bg-yellow-200 hover:bg-yellow-300 text-yellow-800 ${wrongRuleAttempts[opt.display] === 'wrong' ? 'animate-shake-short bg-red-300' : ''}`}
                        >
                            {opt.display}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (step === 'FILL_BLANKS' || step === 'COMPLETE') {
        let blankCounter = -1;
        const itemBaseClass = `font-bold rounded-lg shadow-md transition-all transform flex items-center justify-center ${theme.inputs.sequenceItem}`;
        const promptWithHTML = step === 'COMPLETE' ? "Chính xác! Bé giỏi quá!" : `Bước 2: Dùng quy luật <strong>${selectedRule?.display || ''}</strong> để điền số còn thiếu nhé.`;

        return (
            <div className="flex flex-col items-center w-full animate-pop-scale">
                <StyledPrompt text={promptWithHTML} onAudioClick={step === 'COMPLETE' ? undefined : handleReplayPrompt} isAudioPlaying={isPromptPlaying} />
                <div className="w-full min-h-[120px] p-4 flex flex-wrap items-center justify-center gap-x-1 md:gap-x-2">
                    {question.sequence.map((part, index) => (
                          <React.Fragment key={`item-${index}`}>
                            {part === null ? (
                                (() => {
                                  blankCounter++;
                                  const currentBlankIndex = blankCounter;
                                  const isActive = currentBlankIndex === activeIndex;
                                  const isFilled = inputValues[currentBlankIndex] !== '';
                                  return (
                                    <button 
                                        onClick={() => !disabled && step === 'FILL_BLANKS' && setActiveIndex(currentBlankIndex)}
                                        disabled={disabled} 
                                        className={`${itemBaseClass} ${theme.fontSizes.sequenceInput} ${theme.colors.bg.sequenceTrainBlank} text-center cursor-pointer
                                        ${isActive && !isShaking ? `ring-2 ${theme.colors.border.sequenceItemActive}` : ''}
                                        ${isShaking && isActive ? 'animate-shake-short bg-red-200' : ''}
                                        ${isFilled ? 'text-green-600' : 'text-gray-400'}`}
                                    >
                                        {isFilled ? inputValues[currentBlankIndex] : (step === 'COMPLETE' ? question.answers[currentBlankIndex] : (isActive ? <span className="animate-pulse text-pink-600">?</span> : <span className="text-gray-400">?</span>))}
                                    </button>
                                  );
                                })()
                            ) : (
                              <div className={`${itemBaseClass} ${theme.fontSizes.sequenceNumber} text-white ${theme.colors.bg.sequenceTrainPrimary}`}>
                                {part}
                              </div>
                            )}
                          </React.Fragment>
                       )
                    )}
                </div>
                
                {!disabled && step === 'FILL_BLANKS' && (
                    <div className="mt-6 md:mt-8 w-full flex flex-col items-center gap-4">
                        <CustomNumpad onInput={handleNumpadInput} onDelete={handleNumpadDelete} onEnter={handleNumpadSubmit} />
                    </div>
                )}
            </div>
        );
    }
    
    return null;
};


// --- Sort Sequence Component ---
const SortSequenceDisplay: React.FC<QuestionComponentProps<SortSequenceQuestion>> = ({ question, onAnswer, disabled }) => {
    const { playSound, playPrompt, cancelPrompt, isPromptPlaying } = useAudio();
    const [items, setItems] = useState(() => question.scrambledSequence.map((val, i) => ({ id: `${val}-${i}`, value: val })));
    
    const [isDragging, setIsDragging] = useState(false);
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [draggedItemStyle, setDraggedItemStyle] = useState<React.CSSProperties | null>(null);
    const [initialPointerOffset, setInitialPointerOffset] = useState<{ x: number, y: number } | null>(null);

    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    itemRefs.current = [];

    const promptKey = question.sortOrder === 'asc' ? 'PROMPT_SORT_ASCENDING' : 'PROMPT_SORT_DESCENDING';

    useEffect(() => {
        setItems(question.scrambledSequence.map((val, i) => ({ id: `${val}-${i}`, value: val })));
        setIsDragging(false);
        setDraggingIndex(null);
        setDragOverIndex(null);
        
        if (!disabled) {
            playPrompt([promptKey]);
        }

        return () => { cancelPrompt(); }
    }, [question.id, question.scrambledSequence, playPrompt, cancelPrompt, disabled, promptKey]);


    const handleDragStart = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>, index: number) => {
        if (disabled) return;
        e.preventDefault(); 
        cancelPrompt();
        
        const pointer = 'touches' in e ? e.touches[0] : e;
        const targetElement = e.currentTarget;
        const rect = targetElement.getBoundingClientRect();
        
        setInitialPointerOffset({ x: pointer.clientX - rect.left, y: pointer.clientY - rect.top });
        setDraggedItemStyle({
            position: 'fixed',
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            zIndex: 50,
            opacity: 0.8,
            transform: 'scale(1.1)',
        });
        
        setIsDragging(true);
        setDraggingIndex(index);
        if (navigator.vibrate) navigator.vibrate(50);
    };
    
    const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
        if (!isDragging || initialPointerOffset === null) return;
        if (e.cancelable) e.preventDefault();
        
        const pointer = 'touches' in e ? e.touches[0] : e;

        setDraggedItemStyle(prev => ({
            ...prev,
            top: pointer.clientY - initialPointerOffset.y,
            left: pointer.clientX - initialPointerOffset.x,
        }));

        const targetIndex = itemRefs.current.findIndex(ref => {
            if (!ref) return false;
            const rect = ref.getBoundingClientRect();
            return pointer.clientX >= rect.left && pointer.clientX <= rect.right && pointer.clientY >= rect.top && pointer.clientY <= rect.bottom;
        });
        
        if (targetIndex !== -1 && targetIndex !== dragOverIndex) {
            setDragOverIndex(targetIndex);
        }
    }, [isDragging, initialPointerOffset, dragOverIndex]);

    const handleDragEnd = useCallback(() => {
        if (!isDragging || draggingIndex === null) return;
        
        const newItems = [...items];
        if (dragOverIndex !== null && draggingIndex !== dragOverIndex) {
            playSound('SEQUENCE_ITEM_SLIDE');
            const [draggedItem] = newItems.splice(draggingIndex, 1);
            newItems.splice(dragOverIndex, 0, draggedItem);
            setItems(newItems);
        }
        
        setIsDragging(false);
        setDraggingIndex(null);
        setDragOverIndex(null);
        setDraggedItemStyle(null);
        setInitialPointerOffset(null);
    }, [isDragging, draggingIndex, dragOverIndex, items, playSound]);

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleDragMove);
            document.addEventListener('touchmove', handleDragMove, { passive: false });
            document.addEventListener('mouseup', handleDragEnd);
            document.addEventListener('touchend', handleDragEnd);
        }
        return () => {
            document.removeEventListener('mousemove', handleDragMove);
            document.removeEventListener('touchmove', handleDragMove);
            document.removeEventListener('mouseup', handleDragEnd);
            document.removeEventListener('touchend', handleDragEnd);
        };
    }, [isDragging, handleDragMove, handleDragEnd]);

    const getTransform = (index: number): string => {
        if (draggingIndex === null || dragOverIndex === null || draggingIndex === dragOverIndex || index === draggingIndex) {
            return '';
        }
        if (draggingIndex < dragOverIndex) { // Dragging forward
            if (index > draggingIndex && index <= dragOverIndex) return 'translateX(-105%)';
        } else { // Dragging backward
            if (index >= dragOverIndex && index < draggingIndex) return 'translateX(105%)';
        }
        return '';
    };
    
    const handleSubmit = useCallback(() => {
        if (disabled) return;
        cancelPrompt();
        playSound('DECISION');
        onAnswer(items.map(item => String(item.value)));
    }, [disabled, items, onAnswer, playSound, cancelPrompt]);

    return (
        <div className="flex flex-col items-center w-full">
            {isDragging && draggedItemStyle && draggingIndex !== null && (
                <div style={draggedItemStyle} className={`font-bold rounded-lg flex items-center justify-center pointer-events-none ${theme.fontSizes.sequenceNumber} text-white bg-indigo-500 ring-2 ring-yellow-400 shadow-xl`}>
                    {items[draggingIndex].value}
                </div>
            )}
            
            <div className="flex items-center justify-center gap-x-1 mb-4">
                <p className={`text-xl md:text-2xl lg:text-3xl font-semibold ${theme.colors.text.secondary} text-center`}>{question.promptText}</p>
                <span className={`text-4xl ${question.sortOrder === 'asc' ? 'text-blue-500' : 'text-red-500'}`} aria-hidden="true">
                    {question.sortOrder === 'asc' ? '↑' : '↓'}
                </span>
                <button onClick={() => playPrompt([promptKey])} className="ml-2 text-2xl md:text-3xl text-sky-500 hover:text-sky-700 transition-transform transform hover:scale-110 relative" aria-label="Nghe lại hướng dẫn">
                    🔊
                    {isPromptPlaying && (
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-8 w-8 bg-sky-500 opacity-50"></span>
                        </span>
                    )}
                </button>
            </div>

            <div className="w-full min-h-[120px] p-4 bg-sky-100 rounded-lg shadow-inner flex flex-wrap items-center justify-center gap-2 md:gap-3">
                {items.map((item, index) => (
                    <div
                        key={item.id}
                        ref={el => { itemRefs.current[index] = el; }}
                        onMouseDown={(e) => handleDragStart(e, index)}
                        onTouchStart={(e) => handleDragStart(e, index)}
                        className={`font-bold rounded-lg shadow-md flex items-center justify-center transition-all duration-300 ${theme.inputs.sequenceItem} ${theme.fontSizes.sequenceNumber} text-white bg-indigo-400
                        ${!disabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed'}
                        ${(isDragging && draggingIndex === index) ? 'opacity-0' : 'opacity-100'}
                        `}
                        style={{ transform: getTransform(index) }}
                    >
                        {item.value}
                    </div>
                ))}
            </div>

             <div className="mt-8 w-full flex justify-center">
                <button
                    onClick={handleSubmit}
                    disabled={disabled}
                    className={`${theme.buttons.base} ${theme.buttons.primary}`}
                >
                    OK
                </button>
            </div>
        </div>
    );
};


// --- Main Component ---
const NumberSequenceDisplay: React.FC<QuestionComponentProps<NumberSequenceQuestion>> = (props) => {
  switch (props.question.variant) {
    case 'rule_detective':
        return <RuleDetectiveDisplay {...props as QuestionComponentProps<RuleDetectiveQuestion>} />;
    case 'fill_in_the_blanks':
        return <FillInTheBlanksDisplay {...props as QuestionComponentProps<FillInTheBlanksQuestion>} />;
    case 'sort_sequence':
        return <SortSequenceDisplay {...props as QuestionComponentProps<SortSequenceQuestion>} />;
    default:
        return <div>Loại câu hỏi dãy số không xác định.</div>;
  }
};

export default NumberSequenceDisplay;