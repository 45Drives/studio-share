<template>
    <section class="clc">
        <div class="clc__grid">
            <!-- Lane 1 -->
            <div class="clc__lane">
                <div class="clc__sections">
                    <div class="clc__section">
                        <slot name="expiry" />
                    </div>

                    <div v-if="$slots.commenters" class="clc__section">
                        <slot name="commenters" />
                    </div>
                </div>
            </div>

            <!-- Lane 2 -->
            <div class="clc__lane">
                <div class="clc__sections">
                    <div class="clc__section">
                        <slot name="access" />
                    </div>

                    <div v-if="$slots.accessExtra" class="clc__section">
                        <slot name="accessExtra" />
                    </div>
                </div>
            </div>

            <!-- Lane 3 -->
            <div class="clc__lane">
                <div class="clc__sections">
                    <div v-if="$slots.password" class="clc__section">
                        <slot name="password" />
                    </div>

                    <div v-if="$slots.title" class="clc__section">
                        <slot name="title" />
                    </div>
                </div>
            </div>
        </div>

        <!-- Errors pinned left/right -->
        <div v-if="$slots.errorLeft || $slots.errorRight" class="clc__errors">
            <div class="clc__errorLeft">
                <slot name="errorLeft" />
            </div>
            <div class="clc__errorRight">
                <slot name="errorRight" />
            </div>
        </div>

        <div v-if="$slots.after" class="clc__after">
            <slot name="after" />
        </div>
    </section>
</template>

<style scoped>
.clc {
    width: 100%;
    min-width: 0;
    margin-top: 0.5rem;
}

/* 3-lane grid, stretch so lanes match height */
.clc__grid {
    display: grid;
    grid-template-columns:
        minmax(360px, 1.05fr) minmax(360px, 1.1fr) minmax(420px, 1.25fr);
    gap: 0.75rem;
    align-items: stretch;
    width: 100%;
    min-width: 0;
}

.clc__lane {
    min-width: 0;
    height: 100%;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.02);
    border-radius: 0.6rem;
    padding: 0.75rem;
}

/* Sections stack with automatic dividers */
.clc__sections {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
}

.clc__section {
    min-width: 0;
    padding-top: 0.65rem;
}

.clc__section:first-child {
    padding-top: 0;
}

/* Divider between sections */
.clc__section+.clc__section {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    margin-top: 0.65rem;
}

/* Errors pinned left/right */
.clc__errors {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 0.6rem;
    align-items: start;
}

.clc__errorLeft {
    justify-self: start;
    text-align: left;
    min-width: 0;
}

.clc__errorRight {
    justify-self: end;
    text-align: right;
    min-width: 0;
}

.clc__after {
    margin-top: 0.75rem;
    min-width: 0;
}

/* Responsive: 2 cols */
@media (max-width: 1280px) {
    .clc__grid {
        grid-template-columns: minmax(340px, 1fr) minmax(420px, 1fr);
    }

    .clc__grid> :nth-child(3) {
        grid-column: 1 / -1;
    }
}

/* Responsive: 1 col */
@media (max-width: 900px) {
    .clc__grid {
        grid-template-columns: 1fr;
    }

    .clc__errors {
        grid-template-columns: 1fr;
    }

    .clc__errorRight {
        justify-self: start;
        text-align: left;
    }
}
</style>
