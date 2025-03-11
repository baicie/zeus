import type { TransformHook } from 'rollup';
import type { PropertyMeta } from '@zeus/output';
export declare const commonTransform: TransformHook;
export declare function extractPropsFromType(typeAnnotation: any): PropertyMeta[];
