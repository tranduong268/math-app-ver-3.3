
import { DifficultyLevel, ComparisonQuestion, GameMode, StandardComparisonQuestion, ExpressionComparisonQuestion, TrueFalseComparisonQuestion, ComparisonGenerationOptions } from '../../../types';
import { generateId, shuffleArray } from '../questionUtils';
import { NUM_EQUALS_IN_COMPARISON_ROUND } from '../../../constants';

const generateStandardComparison = (
    difficulty: DifficultyLevel,
    existingSignatures: Set<string>,
    options: ComparisonGenerationOptions = {}
): StandardComparisonQuestion | null => {
    const { allowZero = true, forceEquals = false, forceNotEquals = false } = options;
    let num1, num2, answer, q: StandardComparisonQuestion;
    let signature: string;
    let attempts = 0;

    do {
        attempts++;
        if (attempts > 50) return null;

        if (difficulty === DifficultyLevel.PRE_SCHOOL_CHOI) {
            // Priority: 70% chance for both numbers to be > 10.
            // 30% chance for one number < 10 and one > 10.
            if (Math.random() < 0.7) {
                // Case 1: Both numbers are in the higher range (10-30)
                num1 = Math.floor(Math.random() * (30 - 10 + 1)) + 10;
                num2 = Math.floor(Math.random() * (30 - 10 + 1)) + 10;
            } else {
                // Case 2: Mixed range (one single-digit, one double-digit)
                const minSingleDigit = allowZero ? 0 : 1;
                const singleDigitNum = Math.floor(Math.random() * (10 - minSingleDigit)) + minSingleDigit; // 0-9 or 1-9
                const twoDigitNum = Math.floor(Math.random() * (30 - 10 + 1)) + 10; // 10-30

                // Randomly assign to num1 and num2 to vary the position
                if (Math.random() < 0.5) {
                    num1 = singleDigitNum;
                    num2 = twoDigitNum;
                } else {
                    num1 = twoDigitNum;
                    num2 = singleDigitNum;
                }
            }
        } else { // Mầm logic - More age-appropriate range
            if (Math.random() < 0.8) { // 80% of questions are within 10
                const maxRange = 10;
                const minNum = allowZero ? 0 : 1;
                num1 = Math.floor(Math.random() * (maxRange - minNum + 1)) + minNum;
                num2 = Math.floor(Math.random() * (maxRange - minNum + 1)) + minNum;
            } else { // 20% of questions are slightly harder, up to 20
                const maxRange = 20;
                const minNum = 1;
                num1 = Math.floor(Math.random() * (maxRange - minNum + 1)) + minNum;
                num2 = Math.floor(Math.random() * (maxRange - minNum + 1)) + minNum;
            }
        }

        if (forceEquals) {
            num2 = num1;
        }

        if (forceNotEquals && num1 === num2) {
            continue; // Retry generation if they are equal
        }
        
        if (num1 < num2) answer = '<';
        else if (num1 > num2) answer = '>';
        else answer = '=';
        
        signature = `std-comp-${[num1, num2].sort((a,b)=>a-b).join('-')}`;

    } while (existingSignatures.has(signature));
    
    existingSignatures.add(signature);
    
    q = { 
        id: generateId(), type: 'comparison', variant: 'standard', mode: GameMode.COMPARISON, 
        difficulty: difficulty, number1: num1, number2: num2, answer: answer, 
        promptText: 'Chọn dấu thích hợp:' 
    };
    return q;
};


const generateExpressionComparison = (
    difficulty: DifficultyLevel,
    existingSignatures: Set<string>,
    options: ComparisonGenerationOptions = {}
): ExpressionComparisonQuestion | null => {
    const { allowZero = true, forceEquals = false, forceNotEquals = false } = options;
    let expOp1, expOp2, expRes, compareTo, answer, q: ExpressionComparisonQuestion;
    let signature: string;
    let attempts = 0;
    let expOperator: '+' | '-';
    let expressionSide: 'left' | 'right';

    do {
        attempts++;
        if (attempts > 50) return null;
        
        expOperator = Math.random() < 0.6 ? '+' : '-';

        if (difficulty === DifficultyLevel.PRE_SCHOOL_MAM) {
            // Mầm Level: result within 10
            if (expOperator === '+') {
                expRes = Math.floor(Math.random() * 8) + 3; // Result will be 3-10
                expOp1 = Math.floor(Math.random() * (expRes - 2)) + 1; // Operand 1 will be 1 to Result-2
                expOp2 = expRes - expOp1;
            } else { // '-'
                expOp1 = Math.floor(Math.random() * 9) + 2; // Minuend: 2-10
                expOp2 = Math.floor(Math.random() * (expOp1 - 1)) + 1; // Subtrahend: 1 to Minuend-1
                expRes = expOp1 - expOp2;
            }
        } else { // Chồi Level
            if (expOperator === '+') {
                expRes = Math.floor(Math.random() * 8) + 11; // Result will be 11-18
                expOp1 = Math.floor(Math.random() * 9) + 2; // Operand 1 will be 2-10
                expOp2 = expRes - expOp1;
                if (expOp2 <= 0) continue; // Retry if op2 is not positive
            } else { // '-'
                expOp1 = Math.floor(Math.random() * 11) + 10; // 10-20
                expOp2 = Math.floor(Math.random() * (expOp1 - 2)) + 1;
                expRes = expOp1 - expOp2;
            }
        }
        
        if (!allowZero && (expOp1 === 0 || expOp2 === 0 || expRes === 0)) {
            signature = '';
            continue;
        }

        if (forceEquals) {
            compareTo = expRes;
        } else {
            const maxCompare = difficulty === DifficultyLevel.PRE_SCHOOL_MAM ? 10 : 20;
            const minCompare = allowZero ? 0 : 1;
            const offsetRange = difficulty === DifficultyLevel.PRE_SCHOOL_MAM ? 2 : 3;
            
            let genAttempts = 0;
            do {
                let offset = Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange; // e.g., -2 to +2
                if (forceNotEquals && offset === 0) {
                    offset = shuffleArray([-1, 1])[0];
                }
                compareTo = expRes + offset;
                genAttempts++;
            } while ((compareTo < minCompare || compareTo > maxCompare) && genAttempts < 20);
        
            // Fallback if loop fails
            if (compareTo < minCompare || compareTo > maxCompare) {
                if (expRes > minCompare) compareTo = expRes - 1;
                else compareTo = expRes + 1;
            }
        }
        
        if (!allowZero && compareTo === 0) continue;

        expressionSide = Math.random() < 0.5 ? 'left' : 'right';

        if (expressionSide === 'left') {
            // exp [?] compareTo
            if (expRes < compareTo) answer = '<';
            else if (expRes > compareTo) answer = '>';
            else answer = '=';
        } else { // 'right' side, so we compare compareTo [?] exp
            if (compareTo < expRes) answer = '<';
            else if (compareTo > expRes) answer = '>';
            else answer = '=';
        }
        
        const sortedExpOps = [expOp1, expOp2].sort((a,b)=>a-b).join(expOperator);
        signature = `exp-comp-${sortedExpOps}-vs-${compareTo}`;

    } while (existingSignatures.has(signature));

    existingSignatures.add(signature);
    
    q = { 
        id: generateId(), type: 'comparison', variant: 'expression_comparison', mode: GameMode.COMPARISON, 
        difficulty: difficulty, expOperand1: expOp1, expOperand2: expOp2, expOperator, 
        compareTo, answer, promptText: 'So sánh kết quả phép tính:',
        expressionSide: expressionSide
    };
    return q;
};

const generateTrueFalseComparison = (
    difficulty: DifficultyLevel,
    existingSignatures: Set<string>,
    options: ComparisonGenerationOptions = {}
): TrueFalseComparisonQuestion | null => {
    const { allowZero = true } = options;
    let num1, num2, displayedOperator, answer, signature;
    let attempts = 0;

    do {
        attempts++;
        if (attempts > 50) return null;

        if (difficulty === DifficultyLevel.PRE_SCHOOL_CHOI) {
             if (Math.random() < 0.15) { // 15% chance for special case
                num1 = Math.floor(Math.random() * 11) + 10; // 10-20
                num2 = Math.floor(Math.random() * (9 - (allowZero ? 0 : 1))) + (allowZero ? 0 : 1); // 1-9 or 0-9
            } else { // Main case
                num1 = Math.floor(Math.random() * 11) + 10; // 10-20
                num2 = Math.floor(Math.random() * 11) + 10; // 10-20
            }
        } else { // Mầm
            const maxRange = 10;
            const minNum = allowZero ? 0 : 1;
            num1 = Math.floor(Math.random() * (maxRange - minNum + 1)) + minNum;
            num2 = Math.floor(Math.random() * (maxRange - minNum + 1)) + minNum;
        }

        const trueOperator = num1 < num2 ? '<' : num1 > num2 ? '>' : '=';

        if (Math.random() < 0.5) {
            displayedOperator = trueOperator;
            answer = true;
        } else {
            const otherOperators = (['<', '>', '='] as const).filter(op => op !== trueOperator);
            displayedOperator = shuffleArray(otherOperators)[0];
            answer = false;
        }

        signature = `tf-comp-${num1}${displayedOperator}${num2}`;
    } while (existingSignatures.has(signature));
    
    existingSignatures.add(signature);

    return {
        id: generateId(), type: 'comparison', variant: 'true_false', mode: GameMode.COMPARISON,
        difficulty: difficulty, number1: num1, number2: num2, displayedOperator, answer,
        promptText: 'Phép so sánh này Đúng hay Sai?'
    };
};


export const generateComparisonQuestion = (
    difficulty: DifficultyLevel, 
    existingSignatures: Set<string>,
    options: ComparisonGenerationOptions = {}
): ComparisonQuestion | null => {
    const { requestType = 'STANDARD' } = options;
    
    if (requestType === 'CHALLENGE' && difficulty === DifficultyLevel.PRE_SCHOOL_CHOI) {
        return generateExpressionComparison(difficulty, existingSignatures, options);
    }
    
    if (requestType === 'BOOSTER') {
        return generateStandardComparison(difficulty, existingSignatures, options);
    }
    
    // Standard generation logic
    const variantProb = Math.random();
    if (difficulty === DifficultyLevel.PRE_SCHOOL_MAM) {
        if (variantProb < 0.60) return generateStandardComparison(difficulty, existingSignatures, options);
        if (variantProb < 0.80) return generateTrueFalseComparison(difficulty, existingSignatures, options);
        return generateExpressionComparison(difficulty, existingSignatures, options);
    } else { // Chồi - Probabilities for adaptive mode (1 question at a time)
        if (variantProb < 0.30) {
            return generateExpressionComparison(difficulty, existingSignatures, options); // 30%
        }
        if (variantProb < 0.55) {
            return generateTrueFalseComparison(difficulty, existingSignatures, options); // 25%
        }
        return generateStandardComparison(difficulty, existingSignatures, options); // 45%
    }
};

/**
 * Generates a comparison question guaranteed to have '=' as the answer.
 */
export const generateEqualsComparisonQuestion = (
    difficulty: DifficultyLevel,
    existingSignatures: Set<string>,
    allowZero: boolean
): ComparisonQuestion | null => {
    // For Chồi level, they can handle expression comparisons. Let's mix them in with higher probability.
    if (difficulty === DifficultyLevel.PRE_SCHOOL_CHOI && Math.random() < 0.7) {
        return generateExpressionComparison(difficulty, existingSignatures, { allowZero, forceEquals: true });
    }
    // For Mầm, or for the rest of Chồi, generate a standard A = A question.
    return generateStandardComparison(difficulty, existingSignatures, { allowZero, forceEquals: true });
}

export const generateComparisonQuestionsForChoi = (
    difficulty: DifficultyLevel,
    existingSignatures: Set<string>,
    count: number
): ComparisonQuestion[] => {
    const questions: ComparisonQuestion[] = [];

    // Step 1: Ensure enough "Equals" (=) questions, using the new varied generator.
    for (let i = 0; i < NUM_EQUALS_IN_COMPARISON_ROUND; i++) {
        const q = generateEqualsComparisonQuestion(difficulty, existingSignatures, true);
        if (q) {
            questions.push(q);
        } else {
            // As a fallback to guarantee the minimum, create one directly. This is unlikely to be hit.
            const fallbackQ = generateStandardComparison(difficulty, existingSignatures, { forceEquals: true });
            if(fallbackQ) questions.push(fallbackQ);
        }
    }

    // Step 2: Fill the rest of the round with non-equals questions.
    while(questions.length < count) {
        const q = generateComparisonQuestion(difficulty, existingSignatures, { forceNotEquals: true });
        if(q) {
           questions.push(q);
        } else {
            break; 
        }
    }

    // Step 3: Fallback: In case forceNotEquals fails repeatedly, fill remaining with any comparison questions
    while (questions.length < count) {
        const q = generateComparisonQuestion(difficulty, existingSignatures, {});
        if (q) {
            questions.push(q);
        } else {
            break; // Stop if generator fails entirely
        }
    }

    // Step 4: Shuffle
    let shuffledQuestions = shuffleArray(questions.slice(0, count));

    // Step 5: De-clump "Equals" questions.
    for (let i = 0; i < shuffledQuestions.length - 1; i++) {
        const currentQ = shuffledQuestions[i];
        const nextQ = shuffledQuestions[i+1];
        
        const isCurrentEquals = (currentQ.variant === 'standard' || currentQ.variant === 'expression_comparison') && currentQ.answer === '=';
        const isNextEquals = (nextQ.variant === 'standard' || nextQ.variant === 'expression_comparison') && nextQ.answer === '=';
        
        if (isCurrentEquals && isNextEquals) {
            const swapIndex = shuffledQuestions.findIndex((q, idx) => {
                if (idx > i+1) {
                     const isQEquals = (q.variant === 'standard' || q.variant === 'expression_comparison') && q.answer === '=';
                     return !isQEquals;
                }
                return false;
            });
            
            if(swapIndex > -1) {
                [shuffledQuestions[i+1], shuffledQuestions[swapIndex]] = [shuffledQuestions[swapIndex], shuffledQuestions[i+1]];
            }
        }
    }

    return shuffledQuestions;
};
