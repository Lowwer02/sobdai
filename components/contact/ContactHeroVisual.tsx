import { Mail, Clock, MessageSquare, ShieldCheck, Sparkles } from 'lucide-react'
import styles from '@/app/contact/contact.module.css'

/**
 * ContactHeroVisual — Hero Right Column
 *
 * Lightweight, premium CSS visual for Sobdai Support.
 * Uses pure CSS gradients, borders, and Lucide icons — no external images.
 *
 * Server Component — no 'use client'.
 */
export default function ContactHeroVisual() {
  return (
    <div className={styles.heroVisualCard} aria-hidden="true">
      {/* Ambient background glow */}
      <div className={styles.heroVisualGlow} />

      {/* Status badge */}
      <div className={styles.heroVisualBadge}>
        <span className={styles.reassuranceDot} />
        <span>พร้อมให้ความช่วยเหลือ</span>
      </div>

      {/* Icon emblem */}
      <div className={styles.heroVisualIconBox}>
        <Mail size={26} strokeWidth={1.8} />
      </div>

      {/* Heading / Subtitle */}
      <p className={styles.heroVisualTitle}>Sobdai Support Care</p>
      <p className={styles.heroVisualDesc}>
        ช่องทางติดต่อและรับฟังทุกข้อคิดเห็น เพื่อร่วมพัฒนาพื้นที่เตรียมสอบราชการ
      </p>

      {/* Micro channel summary */}
      <div className={styles.heroVisualList}>
        <div className={styles.heroVisualListItem}>
          <span className={styles.heroVisualListLabel}>ช่องทางหลัก</span>
          <span className={styles.heroVisualListValue}>support.sobdai@gmail.com</span>
        </div>
        <div className={styles.heroVisualListItem}>
          <span className={styles.heroVisualListLabel}>เวลาทำการ</span>
          <span className={styles.heroVisualListValue}>จันทร์ – ศุกร์ (09:00 – 18:00 น.)</span>
        </div>
        <div className={styles.heroVisualListItem}>
          <span className={styles.heroVisualListLabel}>การตอบกลับ</span>
          <span className={styles.heroVisualListValue}>โดยทั่วไปภายใน 1–3 วันทำการ</span>
        </div>
      </div>
    </div>
  )
}
