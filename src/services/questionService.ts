// src/services/questionService.ts

import { GameMode, DifficultyLevel, Question, ShapeType, IconData, QuestionRequestType, QuestionGenerationContext, ComparisonQuestion } from '../../types';
import { getAllBaseUnlockedIcons, shuffleArray, questionContainsZero } from './questionUtils';
import { ICON_DATA } from '../data/iconData';

// Import individual question generators
import { generateAdditionQuestion, generateSubtractionQuestion } from './generators/mathQuestionGenerator';
import { generateComparisonQuestion, generateEqualsComparisonQuestion, generateComparisonQuestionsForChoi } from './generators/comparisonQuestionGenerator';
import { generateCountingQuestion } from './generators/countingQuestionGenerator';
import { generateMatchingPairsQuestion } from './generators/matchingPairsGenerator';
import { generateNumberRecognitionQuestion } from './generators/numberRecognitionGenerator';
import { generateNumberSequenceQuestion } from './generators/numberSequenceGenerator';
// AI-based generators are now used for these modes
import { generateAiQuestionsBatch } from './aiService'; 
import { COMPREHENSIVE_CHALLENGE_QUESTIONS, MIXED_MATH_CHALLENGE_QUESTIONS_CHOI, MIXED_MATH_CHALLENGE_QUESTIONS_MAM, NUM_EQUALS_IN_COMPARISON_ROUND, ODD_ONE_OUT_PROMPTS, VISUAL_PATTERN_PROMPTS, NUM_QUESTIONS_PER_ROUND } from '../../constants';


// Function to get specific, underused icons to enforce diversity.
const getSeedIconsForBatch = (
    allIcons: IconData[],
    masterUsedIcons: ShapeType[],
    count: number
): IconData[] => {
    const masterUsedSet = new Set(masterUsedIcons);

    // Prioritize icons that have NEVER been used.
    const freshIcons = allIcons.filter(icon => !masterUsedSet.has(icon.emoji));
    
    if (freshIcons.length >= count) {
        return shuffleArray(freshIcons).slice(0, count);
    }

    // If not enough fresh icons, take all of them and fill the rest with the least recently used ones.
    const seededIcons = [...freshIcons];
    const usedIconsInOrder = masterUsedIcons.slice().reverse(); // Least recent are now at the start
    
    for (const usedEmoji of usedIconsInOrder) {
        if (seededIcons.length >= count) break;
        const iconData = allIcons.find(i => i.emoji === usedEmoji);
        // Ensure we don't add duplicates if freshIcons was populated
        if (iconData && !seededIcons.some(si => si.emoji === iconData.emoji)) {
            seededIcons.push(iconData);
        }
    }
    
    // Fallback if still not enough icons (e.g., very new player)
    if (seededIcons.length < count) {
        const remainingIcons = allIcons.filter(icon => !seededIcons.some(si => si.emoji === icon.emoji));
        seededIcons.push(...shuffleArray(remainingIcons).slice(0, count - seededIcons.length));
    }

    return shuffleArray(seededIcons);
};

export const generateSingleQuestion = async (
    mode: GameMode,
    difficulty: DifficultyLevel,
    requestType: QuestionRequestType = 'STANDARD',
    context: QuestionGenerationContext
): Promise<Question | null> => {
    let question: Question | null = null;
    let attempts = 0;
    const MAX_ATTEMPTS_PER_QUESTION = 20;

    const {
        existingSignatures,
        baseUnlockedIcons = [],
        globallyRecentIcons = [],
        iconsUsedInCurrentGenerationCycle = new Set(),
        usedIconsThisModeCycle = new Set(),
        failedQuestion,
        allowZero
    } = context;

    while (!question && attempts < MAX_ATTEMPTS_PER_QUESTION) {
        attempts++;
        switch (mode) {
          case GameMode.ADDITION:
            question = generateAdditionQuestion(difficulty, existingSignatures, {requestType, failedQuestion, allowZero});
            break;
          case GameMode.SUBTRACTION:
            question = generateSubtractionQuestion(difficulty, existingSignatures, {requestType, failedQuestion, allowZero});
            break;
          case GameMode.COMPARISON:
            question = generateComparisonQuestion(difficulty, existingSignatures, {requestType, failedQuestion, allowZero});
            break;
          case GameMode.COUNTING:
            question = generateCountingQuestion(difficulty, existingSignatures, baseUnlockedIcons, globallyRecentIcons, iconsUsedInCurrentGenerationCycle);
            break;
          case GameMode.NUMBER_RECOGNITION:
            question = generateNumberRecognitionQuestion(difficulty, existingSignatures, baseUnlockedIcons, globallyRecentIcons, iconsUsedInCurrentGenerationCycle, usedIconsThisModeCycle);
            break;
          case GameMode.MATCHING_PAIRS:
            question = generateMatchingPairsQuestion(difficulty, existingSignatures, baseUnlockedIcons, globallyRecentIcons, iconsUsedInCurrentGenerationCycle, usedIconsThisModeCycle);
            break;
          case GameMode.NUMBER_SEQUENCE:
            question = generateNumberSequenceQuestion(difficulty, existingSignatures);
            break;
          // AI modes are generated in batches, not adaptively for now.
          default:
            return null;
        }
    }
    return question;
};


export const generateQuestionsForRound = async (
  mode: GameMode,
  difficulty: DifficultyLevel,
  unlockedSetIds: string[],
  numQuestions: number,
  masterUsedIcons: ShapeType[],
  existingSignatures: Set<string>
): Promise<{ questions: Question[], iconsUsedInRound: Set<ShapeType>, zerosGenerated: number }> => {
  const iconsUsedInCurrentGenerationCycle = new Set<ShapeType>();
  
  // --- AI Mode Handling (Batch Generation with Icon Seeding) ---
  if (mode === GameMode.ODD_ONE_OUT || mode === GameMode.VISUAL_PATTERN) {
    const allUnlockedIconsData = getAllBaseUnlockedIcons(unlockedSetIds)
      .map(emoji => ICON_DATA.find(d => d.emoji === emoji))
      .filter((d): d is IconData => d !== undefined);
    
    const numSeedIcons = difficulty === DifficultyLevel.PRE_SCHOOL_MAM ? 2 : 4;
    const seedIcons = getSeedIconsForBatch(allUnlockedIconsData, masterUsedIcons, numSeedIcons);

    const { questions: rawAiQuestions, iconsUsed } = await generateAiQuestionsBatch(
        mode,
        difficulty,
        numQuestions,
        shuffleArray(allUnlockedIconsData), 
        seedIcons 
    );
    
    const finalAiQuestions = rawAiQuestions.map(q => {
        let prompts: string[] = [];
        if (q.mode === GameMode.ODD_ONE_OUT) prompts = ODD_ONE_OUT_PROMPTS;
        else if (q.mode === GameMode.VISUAL_PATTERN) prompts = VISUAL_PATTERN_PROMPTS;

        if (prompts.length > 0) q.promptText = prompts[Math.floor(Math.random() * prompts.length)];
        return q;
    });

    iconsUsed.forEach(icon => iconsUsedInCurrentGenerationCycle.add(icon));
    return { questions: finalAiQuestions, iconsUsedInRound: iconsUsedInCurrentGenerationCycle, zerosGenerated: 0 };
  }

  // --- Standard & Adaptive Mode Handling (Loop-based Generation) ---
  const questions: Question[] = [];
  const allBaseIcons = getAllBaseUnlockedIcons(unlockedSetIds);
  const usedIconsThisModeCycle = new Set<ShapeType>();
  
  // Zero limiting logic for specific modes
  let zerosUsed = 0;
  const ZERO_LIMIT = 2;
  const isZeroLimitedMode = [GameMode.ADDITION, GameMode.SUBTRACTION, GameMode.COMPARISON, GameMode.MIXED_MATH_CHALLENGE].includes(mode);

  // Handle Comprehensive Challenge Mode separately (non-adaptive)
  if (mode === GameMode.COMPREHENSIVE_CHALLENGE) {
    const totalQuestions = COMPREHENSIVE_CHALLENGE_QUESTIONS;
    const numSeq = 3;
    const numComp = 4;
    const numSub = 4;
    const numAdd = totalQuestions - numSeq - numComp - numSub;

    const modesToGenerate = shuffleArray([
      ...Array(numAdd).fill(GameMode.ADDITION),
      ...Array(numSub).fill(GameMode.SUBTRACTION),
      ...Array(numComp).fill(GameMode.COMPARISON),
      ...Array(numSeq).fill(GameMode.NUMBER_SEQUENCE),
    ]);

    for (const gameMode of modesToGenerate) {
        const isCurrentQuestionZeroLimited = [GameMode.ADDITION, GameMode.SUBTRACTION, GameMode.COMPARISON].includes(gameMode);
        let q: Question | null = null;
        let attempts = 0;
        
        do {
            const allowZero = !isCurrentQuestionZeroLimited || zerosUsed < ZERO_LIMIT;
            const candidateQ = await generateSingleQuestion(gameMode, difficulty, 'STANDARD', { existingSignatures, allowZero });
            
            if (candidateQ) {
                const hasZero = isCurrentQuestionZeroLimited && questionContainsZero(candidateQ);
                if (hasZero && zerosUsed >= ZERO_LIMIT) {
                    q = null; // Invalid question due to zero limit, will retry
                } else {
                    q = candidateQ; // Valid question
                }
            } else {
                q = null; // Generation failed
            }
            attempts++;
        } while (!q && attempts < 10); // Loop until we get a valid question or max out attempts.

        if (q) {
            if(isCurrentQuestionZeroLimited && questionContainsZero(q)) {
                zerosUsed++;
            }
            questions.push(q);
        }
    }
    return { questions, iconsUsedInRound: new Set(), zerosGenerated: zerosUsed };
  }
  
  // Handle Mixed Math Challenge Mode (New)
  if (mode === GameMode.MIXED_MATH_CHALLENGE) {
    const isMam = difficulty === DifficultyLevel.PRE_SCHOOL_MAM;
    let numAdd, numSub, numComp;

    if (isMam) {
        numAdd = 10;
        numSub = 10;
        numComp = 10;
    } else { // Choi
        numAdd = 10;
        numSub = 10;
        numComp = 10;
    }

    const modesToGenerate = shuffleArray([
      ...Array(numAdd).fill(GameMode.ADDITION),
      ...Array(numSub).fill(GameMode.SUBTRACTION),
      ...Array(numComp).fill(GameMode.COMPARISON),
    ]);

    for (const gameMode of modesToGenerate) {
        let q: Question | null = null;
        let attempts = 0;
        do {
            const allowZero = zerosUsed < ZERO_LIMIT;
            const candidateQ = await generateSingleQuestion(gameMode, difficulty, 'STANDARD', { existingSignatures, allowZero });
            
            if (candidateQ) {
                if (questionContainsZero(candidateQ) && zerosUsed >= ZERO_LIMIT) {
                    q = null; 
                } else {
                    q = candidateQ;
                }
            } else {
                q = null;
            }
            attempts++;
        } while (!q && attempts < 10);

        if (q) {
            if(questionContainsZero(q)) {
                zerosUsed++;
            }
            questions.push(q);
        }
    }
    return { questions, iconsUsedInRound: new Set(), zerosGenerated: zerosUsed };
  }


  // Special handling for Comparison mode
  if (mode === GameMode.COMPARISON) {
      if (difficulty === DifficultyLevel.PRE_SCHOOL_CHOI) {
          // Use the new, more sophisticated generator for Chồi level
          const choiQuestions = generateComparisonQuestionsForChoi(difficulty, existingSignatures, numQuestions);
          const zerosGenerated = choiQuestions.filter(q => questionContainsZero(q)).length;
          return { questions: choiQuestions, iconsUsedInRound: new Set(), zerosGenerated };
      }
  
      // Keep existing logic for Mầm level
      // 1. Generate exactly NUM_EQUALS_IN_COMPARISON_ROUND "equals" questions
      for (let i = 0; i < NUM_EQUALS_IN_COMPARISON_ROUND; i++) {
          const allowZero = zerosUsed < ZERO_LIMIT;
          const q = generateEqualsComparisonQuestion(difficulty, existingSignatures, allowZero);
          if (q) {
              if (questionContainsZero(q)) zerosUsed++;
              questions.push(q);
          } else {
              console.warn(`Could not generate a guaranteed 'equals' question. The round might have fewer than ${NUM_EQUALS_IN_COMPARISON_ROUND} equals questions.`);
          }
      }
      
      // 2. Fill the rest of the round with non-equals questions
      const numNonEqualsNeeded = numQuestions - questions.length;
      for (let i = 0; i < numNonEqualsNeeded; i++) {
          const allowZero = zerosUsed < ZERO_LIMIT;
          const q = generateComparisonQuestion(difficulty, existingSignatures, { allowZero, forceNotEquals: true });
          if (q) {
              if (questionContainsZero(q)) zerosUsed++;
              questions.push(q);
          } else {
              console.warn('Could not generate a "not-equals" question. Round may be shorter.');
          }
      }
      
      // 3. Fallback: In case forceNotEquals fails repeatedly, fill remaining with any comparison questions
      while (questions.length < numQuestions) {
          const allowZero = zerosUsed < ZERO_LIMIT;
          const q = generateComparisonQuestion(difficulty, existingSignatures, { allowZero });
           if (q) {
              if (questionContainsZero(q)) zerosUsed++;
              questions.push(q);
          } else {
              break; // Stop if generator fails entirely
          }
      }

      return { questions: shuffleArray(questions), iconsUsedInRound: new Set(), zerosGenerated: zerosUsed };
  }


  for (let i = 0; i < numQuestions; i++) {
    let question: Question | null = null;
    let attempts = 0;
    const MAX_GEN_ATTEMPTS = 10;

    do {
        const allowZero = !isZeroLimitedMode || zerosUsed < ZERO_LIMIT;
        const candidateQuestion = await generateSingleQuestion(mode, difficulty, 'STANDARD', { 
            existingSignatures,
            baseUnlockedIcons: allBaseIcons,
            globallyRecentIcons: masterUsedIcons,
            iconsUsedInCurrentGenerationCycle,
            usedIconsThisModeCycle,
            allowZero
        });

        if (candidateQuestion) {
            const hasZero = isZeroLimitedMode && questionContainsZero(candidateQuestion);
            if (hasZero && zerosUsed >= ZERO_LIMIT) {
                // This question is invalid because it has a zero and we're at our limit.
                // The generator already added its signature, so the next attempt will be different.
                question = null; // Discard and retry.
            } else {
                // It's a valid question (either no zero, or zero is allowed).
                question = candidateQuestion;
            }
        } else {
            // Generation failed entirely.
            question = null;
        }
        attempts++;
    } while (!question && attempts < MAX_GEN_ATTEMPTS);


    if (question) {
      if (isZeroLimitedMode && questionContainsZero(question)) {
          zerosUsed++;
      }
      questions.push(question);
    } else {
      console.warn(`Failed to generate a valid question for mode ${mode} at index ${i} after ${MAX_GEN_ATTEMPTS} attempts. Round may be shorter.`);
    }
  }

  return { questions, iconsUsedInRound: iconsUsedInCurrentGenerationCycle, zerosGenerated: zerosUsed };
};