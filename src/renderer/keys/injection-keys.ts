import type { InjectionKey, Ref } from "vue";
import type { DivisionType, Server, DiscoveryState, ConnectionMeta } from "../types";

export const divisionCodeInjectionKey: InjectionKey<Ref<DivisionType>> = Symbol('division-code');
export const currentServerInjectionKey: InjectionKey<Ref<Server | null>> = Symbol('server-info');
export const thisOsInjectionKey: InjectionKey<Ref<string>> = Symbol('this-os');
export const discoveryStateInjectionKey: InjectionKey<DiscoveryState> =
    Symbol('discovery-state')
export const connectionMetaInjectionKey: InjectionKey<Ref<ConnectionMeta>> = Symbol('connection-meta');