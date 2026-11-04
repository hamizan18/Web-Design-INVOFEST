/**
 * MESIN OPTIMASI RUTE (Traveling Salesperson Problem)
 * Tahap 1: Nearest Neighbor  -> membentuk rute awal dengan cepat (greedy).
 * Tahap 2: 2-Opt             -> memperbaiki rute dengan menghilangkan persilangan jalur.
 * Titik 0 pada matriks selalu Depot (awal dan akhir perjalanan).
 */
(function () {
  const tourDistance = (tour, m) => {
    let total = 0;
    for (let i = 0; i < tour.length - 1; i++) total += m[tour[i]][tour[i + 1]];
    return total;
  };

  const twoOptSwap = (tour, i, k) => [
    ...tour.slice(0, i),
    ...tour.slice(i, k + 1).reverse(),
    ...tour.slice(k + 1)
  ];

  function nearestNeighbor(m, start = 0) {
    const n = m.length;
    const visited = new Array(n).fill(false);
    const tour = [start];
    visited[start] = true;
    let current = start;

    for (let step = 1; step < n; step++) {
      let best = -1;
      let bestDist = Infinity;
      for (let c = 0; c < n; c++) {
        if (!visited[c] && m[current][c] < bestDist) {
          bestDist = m[current][c];
          best = c;
        }
      }
      if (best !== -1) {
        tour.push(best);
        visited[best] = true;
        current = best;
      }
    }
    tour.push(start);
    return tour;
  }

  function twoOpt(initialTour, m, maxIterations = 200) {
    let tour = [...initialTour];
    const n = tour.length;
    let improved = true;
    let iterations = 0;

    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;
      for (let i = 0; i < n - 2 && !improved; i++) {
        for (let j = i + 2; j < n - 1; j++) {
          if (i === 0 && j === n - 2) continue; // jaga titik awal & akhir tetap Depot
          const a = tour[i], b = tour[i + 1], c = tour[j], d = tour[j + 1];
          const delta = m[a][c] + m[b][d] - (m[a][b] + m[c][d]);
          if (delta < -0.001) {
            tour = twoOptSwap(tour, i + 1, j);
            improved = true;
            break;
          }
        }
      }
    }
    return { optimizedTour: tour, iterations };
  }

  function solveTSP(m, start = 0) {
    if (!Array.isArray(m) || m.length < 2) {
      throw new Error('Diperlukan minimal 1 Depot dan 1 TPS untuk optimasi rute');
    }
    const n = m.length;
    for (let i = 0; i < n; i++) {
      if (!Array.isArray(m[i]) || m[i].length !== n) throw new Error('Matriks jarak tidak valid');
    }

    if (n === 2) {
      const t = [start, start === 0 ? 1 : 0, start];
      const d = tourDistance(t, m);
      return { tour: t, initialTour: t, initialDistance: d, optimizedDistance: d, savedDistance: 0, improvementPercentage: 0, iterationsCount: 0 };
    }

    const initialTour = nearestNeighbor(m, start);
    const initialDistance = tourDistance(initialTour, m);
    const { optimizedTour, iterations } = twoOpt(initialTour, m);
    const optimizedDistance = tourDistance(optimizedTour, m);
    const savedDistance = initialDistance - optimizedDistance;

    return {
      tour: optimizedTour,
      initialTour,
      initialDistance,
      optimizedDistance,
      savedDistance,
      improvementPercentage: initialDistance > 0 ? parseFloat(((savedDistance / initialDistance) * 100).toFixed(2)) : 0,
      iterationsCount: iterations
    };
  }

  SW.tsp = { solveTSP, nearestNeighbor, twoOpt, twoOptSwap, tourDistance };
})();
