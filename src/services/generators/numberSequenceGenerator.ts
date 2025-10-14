import { DifficultyLevel, NumberSequenceQuestion, GameMode, SequenceTheme, FillInTheBlanksQuestion, RuleDetectiveQuestion, SortSequenceQuestion } from '../../../types';
import { generateId, shuffleArray } from '../questionUtils';

const generateRandomNumberSet = (difficulty: DifficultyLevel): number[] => {
    const count = difficulty === DifficultyLevel.PRE_SCHOOL_MAM ? 4 : 5;
    const maxNum = difficulty === DifficultyLevel.PRE_SCHOOL_MAM ? 10 : 20;
    const set = new Set<number>();
    while (set.size < count) {
        set.add(Math.floor(Math.random() * maxNum) + 1);
    }
    return Array.from(set);
};

const generateArithmeticSequence = (difficulty: DifficultyLevel, step: number): number[] => {
    const lengthOptions = difficulty === DifficultyLevel.PRE_SCHOOL_MAM ? [5, 6] : [6, 7];
    const length = shuffleArray(lengthOptions)[0];
    let startNum: number;

    if (difficulty === DifficultyLevel.PRE_SCHOOL_CHOI) {
        // Chồi level: numbers are between 10 and 30
        const rangeMin = 10;
        const rangeMax = 30;

        if (step > 0) { // Ascending
            const limit = rangeMax - (length - 1) * step;
            if (limit < rangeMin) {
                startNum = rangeMin; // Fallback for unlikely invalid parameters
            } else {
                startNum = Math.floor(Math.random() * (limit - rangeMin + 1)) + rangeMin;
            }
        } else { // Descending
            const minStart = rangeMin + (length - 1) * Math.abs(step);
            if (minStart > rangeMax) {
                startNum = rangeMax; // Fallback
            } else {
                startNum = Math.floor(Math.random() * (rangeMax - minStart + 1)) + minStart;
            }
        }
    } else {
        // Mầm level: original logic with a wider range for more variety
        const rangeMax = 20;
        if (step > 0) { // Ascending
            const limit = rangeMax - (length - 1) * step;
            startNum = Math.floor(Math.random() * (limit > 1 ? limit : 2)) + 1; // ensure start is at least 1
        } else { // Descending
            const minStart = 1 + (length - 1) * Math.abs(step);
            if (rangeMax <= minStart) {
               startNum = minStart + Math.floor(Math.random() * 3);
            } else {
               startNum = Math.floor(Math.random() * (rangeMax - minStart + 1)) + minStart;
            }
        }
    }
    
    return Array.from({ length }, (_, i) => startNum + i * step);
}


const generateFillBlanks = (
    difficulty: DifficultyLevel,
    fullSequence: number[],
): { sequence: (number | null)[], answers: number[] } => {
    const length = fullSequence.length;
    const numBlanksOptions = difficulty === DifficultyLevel.PRE_SCHOOL_MAM ? [1, 2] : [2, 3];
    const numBlanks = shuffleArray(numBlanksOptions)[0];
    
    const sequence = [...fullSequence] as (number | null)[];
    const answers: number[] = [];
    
    const blankIndices = new Set<number>();
    
    // For Mầm, blanks are less likely to be at the very ends
    // CRITICAL FIX: The first two positions must NEVER be blank to establish the rule.
    const possibleIndices = Array.from({length}, (_, i) => i).slice(2);
    if (difficulty === DifficultyLevel.PRE_SCHOOL_MAM) {
        if (Math.random() < 0.7 && possibleIndices.length > 2) possibleIndices.pop();
    }

    const shuffledPossible = shuffleArray(possibleIndices);
    for(let i = 0; i < numBlanks; i++) {
        if (shuffledPossible[i] !== undefined) {
            blankIndices.add(shuffledPossible[i]);
        }
    }

    // Fallback if somehow no blanks were selected
    if (blankIndices.size === 0 && possibleIndices.length > 0) {
        blankIndices.add(shuffleArray(possibleIndices)[0]);
    }

    const sortedBlankIndices = Array.from(blankIndices).sort((a,b) => a-b);
    sortedBlankIndices.forEach(index => {
        answers.push(sequence[index] as number);
        sequence[index] = null;
    });

    return { sequence, answers };
}

const generateErrorsForDetective = (
    fullSequence: number[],
    numErrors: number // This will be 1
): { sequenceWithErrors: number[], errors: Record<number, number> } => {
    const length = fullSequence.length;
    const sequenceWithErrors = [...fullSequence];
    const errors: Record<number, number> = {};
    
    // A sequence must be long enough to establish a pattern before showing an error.
    // The error will be placed at index 3 or later. This requires a sequence of at least 5 numbers
    // to have a valid position for an error that isn't the last number.
    if (length < 5 || numErrors === 0) {
      return { sequenceWithErrors: fullSequence, errors: {} };
    }
    
    const errorIndices = new Set<number>();
    while(errorIndices.size < numErrors) {
        // CRITICAL FIX: The error must be at index 3 or later (the 4th number)
        // so the first 3 numbers shown to the user are always correct.
        // The last possible error position is the second to last number (index length - 2).
        const minErrorIndex = 3;
        const maxErrorIndex = length - 2;
        
        // This should not happen with current sequence lengths (5, 6, 7), but it is a robust safeguard.
        if (minErrorIndex > maxErrorIndex) break;

        const newIndex = Math.floor(Math.random() * (maxErrorIndex - minErrorIndex + 1)) + minErrorIndex;
        errorIndices.add(newIndex);
    }

    errorIndices.forEach(index => {
        const correctValue = fullSequence[index];
        errors[index] = correctValue;
        
        let wrongValue;
        do {
            const offset = shuffleArray([-2, -1, 1, 2])[0];
            wrongValue = correctValue + offset;
        } while (
            wrongValue <= 0 || // Must be positive
            wrongValue === correctValue // Must be different from the correct number
        );
        
        sequenceWithErrors[index] = wrongValue;
    });

    return { sequenceWithErrors, errors };
}

export const generateNumberSequenceQuestion = (
    difficulty: DifficultyLevel,
    existingSignatures: Set<string>
): NumberSequenceQuestion | null => {
    
    let signature: string;
    let question: NumberSequenceQuestion;
    const MAX_ATTEMPTS = 30;
    let attempts = 0;

    do {
        attempts++;
        if (attempts > MAX_ATTEMPTS) return null;

        let variant: 'fill_in_the_blanks' | 'rule_detective' | 'sort_sequence';
        const variantProb = Math.random();

        if (difficulty === DifficultyLevel.PRE_SCHOOL_CHOI) {
            if (variantProb < 0.45) variant = 'fill_in_the_blanks';
            else if (variantProb < 0.75) variant = 'sort_sequence';
            else variant = 'rule_detective';
        } else { // Mầm
            if (variantProb < 0.5) variant = 'fill_in_the_blanks';
            else variant = 'rule_detective';
        }


        const theme = shuffleArray<SequenceTheme>(['train', 'steps'])[0];
        const base = {
            id: generateId(),
            type: 'number_sequence' as const,
            mode: GameMode.NUMBER_SEQUENCE,
            difficulty,
            theme,
        };

        if (variant === 'sort_sequence') {
            const randomNumbers = generateRandomNumberSet(difficulty);
            const sortOrder = shuffleArray<'asc' | 'desc'>(['asc', 'desc'])[0];
            const fullSequence = [...randomNumbers].sort((a, b) => sortOrder === 'asc' ? a - b : b - a);
            let scrambledSequence = shuffleArray(randomNumbers);
            // Ensure it's actually scrambled
            let scrambleAttempts = 0;
            while(JSON.stringify(scrambledSequence) === JSON.stringify(fullSequence) && scrambleAttempts < 5) {
                scrambledSequence = shuffleArray(randomNumbers);
                scrambleAttempts++;
            }
            
            const promptText = `Sắp xếp các số theo thứ tự ${sortOrder === 'asc' ? 'tăng dần (bé đến lớn)' : 'giảm dần (lớn đến bé)'}:`;
            
            question = {
                ...base,
                variant,
                scrambledSequence,
                fullSequence,
                sortOrder,
                promptText,
            };
            signature = `ns-sort-${randomNumbers.sort((a,b)=>a-b).join(',')}-${sortOrder}`;
        } else { // fill_in_the_blanks or rule_detective now have similar setup
            const possibleSteps = difficulty === DifficultyLevel.PRE_SCHOOL_MAM ? [1, -1] : [1, -1, 2];
            const step = shuffleArray(possibleSteps)[0];
            const fullSequence = generateArithmeticSequence(difficulty, step);

            const correctOption = { display: `${step > 0 ? '+' : '–'} ${Math.abs(step)}`, step: step };
            const distractorSteps = new Set<number>();
            const possibleOffsets = [-2, -1, 1, 2];
            while (distractorSteps.size < 2) {
                const offset = shuffleArray(possibleOffsets)[0];
                const distractorStep = step + offset;
                if (distractorStep !== 0 && distractorStep !== step) {
                    distractorSteps.add(distractorStep);
                }
            }
            const ruleOptions = shuffleArray([
                correctOption,
                ...Array.from(distractorSteps).map(s => ({ display: `${s > 0 ? '+' : '–'} ${Math.abs(s)}`, step: s }))
            ]);

            if (variant === 'fill_in_the_blanks') {
                const { sequence, answers } = generateFillBlanks(difficulty, fullSequence);
                // If blank generation failed (e.g., sequence too short), we must retry.
                if (answers.length === 0) {
                    signature = ''; // Invalid signature to force a retry
                    continue;
                }
                question = {
                    ...base,
                    variant,
                    fullSequence,
                    rule: { type: 'skip_counting' as const, step },
                    sequence,
                    answers,
                    ruleOptions, // Add rule options
                    promptText: "Bé hãy tìm quy luật và hoàn thành dãy số nhé:",
                };
                signature = `ns-fill-${fullSequence.join(',')}-${sequence.join(',')}`;
            } else { // rule_detective
                const numErrors = 1; // Always generate exactly one error for this mode.
                const { sequenceWithErrors, errors } = generateErrorsForDetective(fullSequence, numErrors);
                
                if (Object.keys(errors).length === 0) {
                    signature = ''; 
                    continue;
                }

                question = {
                    ...base,
                    variant,
                    fullSequence,
                    rule: { type: 'skip_counting' as const, step },
                    sequenceWithErrors,
                    errors,
                    ruleOptions,
                    promptText: "Bé hãy làm thám tử tìm và sửa lỗi sai nhé!",
                };
                signature = `ns-det-${fullSequence.join(',')}-${Object.values(errors)[0]}`;
            }
        }
    } while(existingSignatures.has(signature));
    
    existingSignatures.add(signature);
    return question;
};