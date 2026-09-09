'use client';

import React,{createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';

const DraftScope=createContext<string|null>(null);
export function FormDraftProvider({actorId,spaceId,children}:{actorId:string;spaceId:string;children:ReactNode}) {
  return <DraftScope.Provider key={JSON.stringify([actorId,spaceId])} value={JSON.stringify([actorId,spaceId])}>{children}</DraftScope.Provider>;
}

/** Tab-local recovery. The authenticated layout supplies identity, never a URL parameter. */
export function useFormDraft<T>(name:string,value:T,restore:(value:T)=>void,baseline:T,enabled=true,conflictPolicy:'discard'|'review'='discard') {
  const scope=useContext(DraftScope);
  const key=scope?`chippi:form:v1:${scope}:${name}`:null;
  const serialized=JSON.stringify(value),original=JSON.stringify(baseline);
  const restoreRef=useRef(restore);restoreRef.current=restore;
  const loaded=useRef<string|null>(null),cleared=useRef<string|null>(null);
  const [conflict,setConflict]=useState<{baseline:T;value:T}|null>(null);
  const pendingConflict=useRef<string|null>(null);
  const [restored,setRestored]=useState(false);
  const [storageError,setStorageError]=useState(false);
  useEffect(()=>{
    if(!key||!enabled)return;
    if(loaded.current!==key){
      loaded.current=key;
      try{
        const raw=sessionStorage.getItem(key);
        if(raw){
          const saved=JSON.parse(raw);
          if(saved.baseline===original&&typeof saved.expires==='number'&&saved.expires>Date.now()&&typeof saved.value==='string'){
            restoreRef.current(JSON.parse(saved.value));setRestored(true);return;
          }
          if(conflictPolicy==='review'&&typeof saved.baseline==='string'&&typeof saved.value==='string'&&typeof saved.expires==='number'&&saved.expires>Date.now()){
            const recovery={baseline:JSON.parse(saved.baseline) as T,value:JSON.parse(saved.value) as T};
            pendingConflict.current=key;setConflict(recovery);return;
          }
          sessionStorage.removeItem(key);
        }
      }catch{setStorageError(true);}
    }
    if(pendingConflict.current===key||cleared.current===serialized)return;
    try{
      if(serialized===original)sessionStorage.removeItem(key);
      else sessionStorage.setItem(key,JSON.stringify({baseline:original,value:serialized,expires:Date.now()+24*60*60*1000}));
      setStorageError(false);
    }catch{setStorageError(true);}
  },[key,serialized,original,enabled,conflictPolicy]);
  function clear(){
    cleared.current=serialized;pendingConflict.current=null;setConflict(null);setRestored(false);
    if(key)try{sessionStorage.removeItem(key);}catch{setStorageError(true);}
  }
  function resolveConflict(next:T){
    pendingConflict.current=null;cleared.current=null;setConflict(null);setRestored(JSON.stringify(next)!==original);
    restoreRef.current(next);
    if(key)try{
      const value=JSON.stringify(next);
      if(value===original)sessionStorage.removeItem(key);
      else sessionStorage.setItem(key,JSON.stringify({baseline:original,value,expires:Date.now()+24*60*60*1000}));
    }catch{setStorageError(true);}
  }
  return {clear,restored,storageError,conflict,resolveConflict};
}
