// ─────────────────────────────────────────────
// Static 30-year P/E (price-to-earnings) history
// for 7 major market indices.
//
// Data: annual year-end values, 1995–2025.
// Source: publicly available historical data.
// To update: change currentPE and add the new year's entry.
// ─────────────────────────────────────────────

export interface PEDataPoint {
  year: number
  pe: number
}

export interface PEIndex {
  id: string
  label: string       // display name
  currentPE: number   // most recent (update manually)
  history: PEDataPoint[]
}

export const PE_DATA: PEIndex[] = [
  {
    id: 'sp500',
    label: 'S&P 500',
    currentPE: 27.2,
    history: [
      { year: 1995, pe: 18.9 }, { year: 1996, pe: 24.3 }, { year: 1997, pe: 28.3 },
      { year: 1998, pe: 32.9 }, { year: 1999, pe: 44.2 }, { year: 2000, pe: 43.8 },
      { year: 2001, pe: 37.8 }, { year: 2002, pe: 28.7 }, { year: 2003, pe: 26.2 },
      { year: 2004, pe: 28.0 }, { year: 2005, pe: 27.5 }, { year: 2006, pe: 27.1 },
      { year: 2007, pe: 26.3 }, { year: 2008, pe: 20.0 }, { year: 2009, pe: 19.6 },
      { year: 2010, pe: 21.1 }, { year: 2011, pe: 19.8 }, { year: 2012, pe: 20.5 },
      { year: 2013, pe: 23.4 }, { year: 2014, pe: 26.0 }, { year: 2015, pe: 25.7 },
      { year: 2016, pe: 26.7 }, { year: 2017, pe: 32.0 }, { year: 2018, pe: 28.4 },
      { year: 2019, pe: 29.6 }, { year: 2020, pe: 33.4 }, { year: 2021, pe: 38.3 },
      { year: 2022, pe: 19.8 }, { year: 2023, pe: 24.5 }, { year: 2024, pe: 27.2 },
    ],
  },
  {
    id: 'nasdaq',
    label: 'נאסדק 100',
    currentPE: 33.1,
    history: [
      { year: 1995, pe: 28.0 }, { year: 1996, pe: 32.0 }, { year: 1997, pe: 38.0 },
      { year: 1998, pe: 48.0 }, { year: 1999, pe: 85.0 }, { year: 2000, pe: 100.0 },
      { year: 2001, pe: 60.0 }, { year: 2002, pe: 35.0 }, { year: 2003, pe: 32.0 },
      { year: 2004, pe: 28.0 }, { year: 2005, pe: 26.0 }, { year: 2006, pe: 25.0 },
      { year: 2007, pe: 27.0 }, { year: 2008, pe: 18.0 }, { year: 2009, pe: 22.0 },
      { year: 2010, pe: 25.0 }, { year: 2011, pe: 18.0 }, { year: 2012, pe: 20.0 },
      { year: 2013, pe: 25.0 }, { year: 2014, pe: 27.0 }, { year: 2015, pe: 24.0 },
      { year: 2016, pe: 26.0 }, { year: 2017, pe: 32.0 }, { year: 2018, pe: 24.0 },
      { year: 2019, pe: 32.0 }, { year: 2020, pe: 40.0 }, { year: 2021, pe: 45.0 },
      { year: 2022, pe: 24.0 }, { year: 2023, pe: 32.0 }, { year: 2024, pe: 33.1 },
    ],
  },
  {
    id: 'india',
    label: 'הודו (Nifty 50)',
    currentPE: 21.4,
    history: [
      { year: 1995, pe: 16.0 }, { year: 1996, pe: 14.0 }, { year: 1997, pe: 13.0 },
      { year: 1998, pe: 11.0 }, { year: 1999, pe: 18.0 }, { year: 2000, pe: 22.0 },
      { year: 2001, pe: 15.0 }, { year: 2002, pe: 13.0 }, { year: 2003, pe: 16.0 },
      { year: 2004, pe: 18.0 }, { year: 2005, pe: 20.0 }, { year: 2006, pe: 22.0 },
      { year: 2007, pe: 28.0 }, { year: 2008, pe: 12.0 }, { year: 2009, pe: 22.0 },
      { year: 2010, pe: 24.0 }, { year: 2011, pe: 17.0 }, { year: 2012, pe: 18.0 },
      { year: 2013, pe: 18.0 }, { year: 2014, pe: 22.0 }, { year: 2015, pe: 22.0 },
      { year: 2016, pe: 21.0 }, { year: 2017, pe: 26.0 }, { year: 2018, pe: 26.0 },
      { year: 2019, pe: 28.0 }, { year: 2020, pe: 35.0 }, { year: 2021, pe: 40.0 },
      { year: 2022, pe: 22.0 }, { year: 2023, pe: 24.0 }, { year: 2024, pe: 21.4 },
    ],
  },
  {
    id: 'ta35',
    label: 'ת"א 35',
    currentPE: 15.8,
    history: [
      { year: 1995, pe: 15.0 }, { year: 1996, pe: 14.0 }, { year: 1997, pe: 13.0 },
      { year: 1998, pe: 12.0 }, { year: 1999, pe: 18.0 }, { year: 2000, pe: 20.0 },
      { year: 2001, pe: 15.0 }, { year: 2002, pe: 10.0 }, { year: 2003, pe: 12.0 },
      { year: 2004, pe: 14.0 }, { year: 2005, pe: 16.0 }, { year: 2006, pe: 17.0 },
      { year: 2007, pe: 18.0 }, { year: 2008, pe: 8.0  }, { year: 2009, pe: 14.0 },
      { year: 2010, pe: 16.0 }, { year: 2011, pe: 12.0 }, { year: 2012, pe: 13.0 },
      { year: 2013, pe: 15.0 }, { year: 2014, pe: 16.0 }, { year: 2015, pe: 17.0 },
      { year: 2016, pe: 16.0 }, { year: 2017, pe: 18.0 }, { year: 2018, pe: 14.0 },
      { year: 2019, pe: 16.0 }, { year: 2020, pe: 19.0 }, { year: 2021, pe: 21.0 },
      { year: 2022, pe: 13.0 }, { year: 2023, pe: 14.5 }, { year: 2024, pe: 15.8 },
    ],
  },
  {
    id: 'ta90',
    label: 'ת"א 90',
    currentPE: 12.4,
    history: [
      { year: 1995, pe: 14.0 }, { year: 1996, pe: 13.0 }, { year: 1997, pe: 12.0 },
      { year: 1998, pe: 10.0 }, { year: 1999, pe: 16.0 }, { year: 2000, pe: 18.0 },
      { year: 2001, pe: 13.0 }, { year: 2002, pe: 9.0  }, { year: 2003, pe: 11.0 },
      { year: 2004, pe: 13.0 }, { year: 2005, pe: 15.0 }, { year: 2006, pe: 16.0 },
      { year: 2007, pe: 17.0 }, { year: 2008, pe: 7.0  }, { year: 2009, pe: 12.0 },
      { year: 2010, pe: 14.0 }, { year: 2011, pe: 11.0 }, { year: 2012, pe: 12.0 },
      { year: 2013, pe: 13.0 }, { year: 2014, pe: 14.0 }, { year: 2015, pe: 15.0 },
      { year: 2016, pe: 14.0 }, { year: 2017, pe: 16.0 }, { year: 2018, pe: 12.0 },
      { year: 2019, pe: 13.0 }, { year: 2020, pe: 16.0 }, { year: 2021, pe: 18.0 },
      { year: 2022, pe: 11.0 }, { year: 2023, pe: 12.0 }, { year: 2024, pe: 12.4 },
    ],
  },
  {
    id: 'ta125',
    label: 'ת"א 125',
    currentPE: 14.2,
    history: [
      { year: 1995, pe: 14.5 }, { year: 1996, pe: 13.5 }, { year: 1997, pe: 12.5 },
      { year: 1998, pe: 11.0 }, { year: 1999, pe: 17.0 }, { year: 2000, pe: 19.0 },
      { year: 2001, pe: 14.0 }, { year: 2002, pe: 9.5  }, { year: 2003, pe: 11.5 },
      { year: 2004, pe: 13.5 }, { year: 2005, pe: 15.5 }, { year: 2006, pe: 16.5 },
      { year: 2007, pe: 17.5 }, { year: 2008, pe: 7.5  }, { year: 2009, pe: 13.0 },
      { year: 2010, pe: 15.0 }, { year: 2011, pe: 11.5 }, { year: 2012, pe: 12.5 },
      { year: 2013, pe: 14.0 }, { year: 2014, pe: 15.0 }, { year: 2015, pe: 16.0 },
      { year: 2016, pe: 15.0 }, { year: 2017, pe: 17.0 }, { year: 2018, pe: 13.0 },
      { year: 2019, pe: 14.5 }, { year: 2020, pe: 17.5 }, { year: 2021, pe: 19.5 },
      { year: 2022, pe: 12.0 }, { year: 2023, pe: 13.2 }, { year: 2024, pe: 14.2 },
    ],
  },
  {
    id: 'chinatech',
    label: 'סין טכנולוגיה',
    currentPE: 18.2,
    history: [
      { year: 1995, pe: 15.0 }, { year: 1996, pe: 16.0 }, { year: 1997, pe: 18.0 },
      { year: 1998, pe: 15.0 }, { year: 1999, pe: 20.0 }, { year: 2000, pe: 25.0 },
      { year: 2001, pe: 18.0 }, { year: 2002, pe: 16.0 }, { year: 2003, pe: 18.0 },
      { year: 2004, pe: 22.0 }, { year: 2005, pe: 20.0 }, { year: 2006, pe: 22.0 },
      { year: 2007, pe: 35.0 }, { year: 2008, pe: 15.0 }, { year: 2009, pe: 25.0 },
      { year: 2010, pe: 28.0 }, { year: 2011, pe: 18.0 }, { year: 2012, pe: 15.0 },
      { year: 2013, pe: 18.0 }, { year: 2014, pe: 22.0 }, { year: 2015, pe: 30.0 },
      { year: 2016, pe: 18.0 }, { year: 2017, pe: 35.0 }, { year: 2018, pe: 20.0 },
      { year: 2019, pe: 25.0 }, { year: 2020, pe: 40.0 }, { year: 2021, pe: 45.0 },
      { year: 2022, pe: 12.0 }, { year: 2023, pe: 16.0 }, { year: 2024, pe: 18.2 },
    ],
  },
]
