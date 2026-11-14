import {FURNITURE,CHARACTER_ASSET} from './layout.mjs';
export const ASSET_CDN='https://cdn.jsdelivr.net/gh/Hidencod/tge-assets@main/packs';
export const ASSET_RAW='https://raw.githubusercontent.com/Hidencod/tge-assets/main/packs';
export const REQUIRED_MODELS=Object.freeze([...new Set([...FURNITURE.map(f=>`${f.pack}/${f.model}`),...(CHARACTER_ASSET.url?[]:[`${CHARACTER_ASSET.pack}/${CHARACTER_ASSET.model}`])])].sort());
